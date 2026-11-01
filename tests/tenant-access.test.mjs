import assert from 'node:assert/strict'
import test from 'node:test'
import { getDentalStore, runDentalAction, scopeStore } from '../lib/dentalos-service.ts'
import { readJsonBody } from '../lib/request-body.ts'

const now = new Date('2026-11-02T07:00:00Z')
const access = { status: 'ready', practiceId: 'practice_a', role: 'owner' }
function practice(id) {
  return {
    id, name: id, location: '', timezone: 'Europe/Amsterdam', opens: '09:00', closes: '17:00', approvalRequired: true, staffRole: 'Practice manager',
    patients: [{ id: `patient_${id}`, name: 'Synthetic Test', email: '', phone: '+31000000000', notes: '', consent: true, recall: true, waitlist: false }],
    appointments: [{ id: `appointment_${id}`, patientId: `patient_${id}`, date: '2026-11-03', time: '10:00', duration: 30, provider: 'Dentist A', chair: 'Chair 1', treatment: 'Check-up', status: 'Confirmed', source: 'Staff' }],
    conversations: [{ id: `conversation_${id}`, patientId: `patient_${id}`, channel: 'Web', status: 'Staff handling', assigned: 'Staff', messages: [] }],
    approvals: [{ id: `apr_${id}:recall_123`, title: 'Recall', description: 'Synthetic test', kind: 'recall', patientIds: [`patient_${id}`], agentId: 'reminders', status: 'Pending' }],
    agents: [{ id: 'reception', name: 'Ava', role: '', description: '', enabled: true, faq: '', handled: 0 }], activity: [], recipes: {},
  }
}
function transport(modify) {
  const store = { version: 1, activeId: 'practice_b', practices: [practice('practice_a'), practice('practice_b')], foreignData: 'must not pass through' }
  modify?.(store)
  const calls = []
  const call = async (workflow, action, payload, practiceId) => {
    calls.push({ workflow, action, payload, practiceId })
    return { ok: true, body: { success: true, message: 'Saved', store, result: { token: 'private-cache-token', foreignData: { medicalNotes: 'secret' } }, internal: 'secret' } }
  }
  return { call, calls, store }
}
const request = (workflow, action, payload) => ({ workflow, action, payload, practice_id: 'practice_a' })

test('read access rejects signed-out, unassigned, disallowed, and invalid-role accounts before n8n', async () => {
  for (const [account, allowed, expected] of [
    [{ status: 'signed_out' }, ['practice_a'], 401],
    [{ status: 'unassigned' }, ['practice_a'], 403],
    [{ status: 'unavailable' }, ['practice_a'], 503],
    [access, [], 403],
    [{ ...access, role: 'invalid' }, ['practice_a'], 403],
  ]) {
    const t = transport()
    assert.equal((await getDentalStore(account, allowed, t.call, now)).status, expected)
    assert.equal(t.calls.length, 0)
  }
})

test('snapshot responses contain only the assigned practice and known fields', async () => {
  const t = transport(s => { s.practices[0].otherPractice = { medicalNotes: 'secret' } })
  const reply = await getDentalStore(access, ['practice_a'], t.call, now)
  assert.equal(reply.status, 200)
  assert.deepEqual(reply.body.store.practices.map(p => p.id), ['practice_a'])
  assert.equal(reply.body.store.activeId, 'practice_a')
  assert.equal(JSON.stringify(reply.body).includes('secret'), false)
  assert.equal(reply.body.store.foreignData, undefined)
})

test('ambiguous or malformed snapshots fail closed', () => {
  assert.equal(scopeStore({ version: 1, practices: [practice('practice_a'), practice('practice_a')] }, 'practice_a'), null)
  assert.equal(scopeStore({ version: 1, practices: [practice('practice_b')] }, 'practice_a'), null)
  assert.equal(scopeStore({ version: 1, practices: [{ id: 'practice_a' }] }, 'practice_a'), null)
})

test('every record-based action rejects a foreign record before a mutation', async () => {
  const attempts = [
    request('milo', 'optout', { patientId: 'patient_practice_b', text: 'Stop' }),
    request('milo', 'message', { patientId: 'patient_practice_b', text: 'Hello' }),
    request('milo', 'message', { patientId: 'patient_practice_a', conversationId: 'conversation_practice_b', text: 'Hello' }),
    request('state', 'patient', { id: 'patient_practice_b', consent: false }),
    request('state', 'conversation', { id: 'conversation_practice_b', status: 'Resolved', text: 'Resolved' }),
    request('state', 'status', { id: 'appointment_practice_b', status: 'Arrived' }),
    request('approvals', 'decide', { id: 'apr_practice_b:recall_123', approve: true }),
    request('ava', 'cancel', { appointmentId: 'appointment_practice_b' }),
    request('ava', 'book', { appointment: { id: 'appointment_practice_b', patientId: 'patient_practice_a', treatment: 'Check-up', date: '2026-11-03', time: '11:00' } }),
    request('finn', 'invite', { appointmentId: 'appointment_practice_b' }),
  ]
  for (const input of attempts) {
    const t = transport()
    const reply = await runDentalAction(input, access, ['practice_a'], t.call, now)
    assert.equal(reply.status, 409, `${input.workflow}/${input.action}`)
    assert.deepEqual(t.calls.map(c => c.action), ['availability'])
  }
})

test('forged practice IDs and manager-only requests never reach n8n', async () => {
  for (const [input, account] of [
    [{ ...request('state', 'patient', { id: 'patient_practice_a', consent: false }), practice_id: 'practice_b' }, access],
    [request('approvals', 'decide', { id: 'apr_practice_a:recall_123', approve: true }), { ...access, role: 'staff' }],
  ]) {
    const t = transport()
    assert.equal((await runDentalAction(input, account, ['practice_a'], t.call, now)).status, 403)
    assert.equal(t.calls.length, 0)
  }
})

test('valid colon-containing Luna approval IDs are accepted and response secrets are removed', async () => {
  const t = transport()
  const reply = await runDentalAction(request('approvals', 'decide', { id: 'apr_practice_a:recall_123', approve: true }), access, ['practice_a'], t.call, now)
  assert.equal(reply.status, 200)
  assert.equal(reply.body.success, true)
  assert.deepEqual(t.calls.map(c => c.action), ['availability', 'decide'])
  assert.deepEqual(reply.body.result, {})
  assert.equal(reply.body.internal, undefined)
  assert.equal(reply.body.store.practices.length, 1)
})

test('approval recipients must also belong to the practice', async () => {
  const t = transport(s => { s.practices[0].approvals[0].patientIds = ['patient_practice_b'] })
  const reply = await runDentalAction(request('approvals', 'decide', { id: 'apr_practice_a:recall_123', approve: true }), access, ['practice_a'], t.call, now)
  assert.equal(reply.status, 409)
  assert.equal(t.calls.length, 1)
})

test('booking commits once after validation without replaying cached confirmation tokens', async () => {
  const t = transport()
  const reply = await runDentalAction(request('ava', 'book', { appointment: { patientId: 'patient_practice_a', treatment: 'Check-up', date: '2026-11-03', time: '11:00' } }), access, ['practice_a'], t.call, now)
  assert.equal(reply.status, 200)
  assert.deepEqual(t.calls.map(c => c.action), ['availability', 'preview'])
  assert.equal(reply.body.result.token, undefined)
  for (const action of ['confirm', 'preview', 'cancel-preview']) {
    assert.equal((await runDentalAction(request('ava', action, { token: 'foreign-token' }), access, ['practice_a'], t.call, now)).status, 400)
  }
  assert.equal(t.calls.length, 2)
})

test('bookings reject weekends, past times, out-of-hours visits, foreign patients and overlaps', async () => {
  const base = { patientId: 'patient_practice_a', treatment: 'Check-up', date: '2026-11-03', time: '11:00' }
  for (const edit of [
    { date: '2026-11-07' }, { date: '2026-11-01' }, { time: '19:00' },
    { time: '16:45' }, { patientId: 'patient_practice_b' }, { time: '10:15' },
    { id: 'appointment_practice_a', treatment: 'Different treatment' },
  ]) {
    const t = transport()
    assert.equal((await runDentalAction(request('ava', 'book', { appointment: { ...base, ...edit } }), access, ['practice_a'], t.call, now)).status, 409)
    assert.equal(t.calls.length, 1)
  }
})

test('malformed calendar dates are rejected before reading practice data', async () => {
  const t = transport()
  assert.equal((await runDentalAction(request('ava', 'availability', { date: '2026-02-31' }), access, ['practice_a'], t.call, now)).status, 400)
  assert.equal(t.calls.length, 0)
})

test('rescheduling preserves the original duration when checking closing time and conflicts', async () => {
  for (const time of ['16:30', '11:00']) {
    const t = transport(s => {
      const p = s.practices[0]
      p.appointments[0].duration = 60
      p.appointments.push({ ...p.appointments[0], id: 'other_visit', patientId: 'other_patient', time: '11:30', duration: 30 })
    })
    const input = request('ava', 'book', { appointment: { id: 'appointment_practice_a', patientId: 'patient_practice_a', treatment: 'Check-up', date: '2026-11-03', time } })
    assert.equal((await runDentalAction(input, access, ['practice_a'], t.call, now)).status, 409)
    assert.equal(t.calls.length, 1)
  }
})

test('closed appointments and completed approvals cannot be processed again', async () => {
  const t = transport(s => { s.practices[0].appointments[0].status = 'Completed'; s.practices[0].approvals[0].status = 'Approved' })
  for (const input of [request('ava', 'cancel', { appointmentId: 'appointment_practice_a' }), request('state', 'status', { id: 'appointment_practice_a', status: 'Confirmed' }), request('approvals', 'decide', { id: 'apr_practice_a:recall_123', approve: true })]) {
    assert.equal((await runDentalAction(input, access, ['practice_a'], t.call, now)).status, 409)
  }
  assert.equal(t.calls.every(c => c.action === 'availability'), true)
})

test('unimplemented recipe toggles and inherited object properties are rejected', async () => {
  const t = transport()
  for (const input of [request('state', 'recipe', { id: 'recall', enabled: false }), request('ava', 'constructor', {}), request('ava', '__proto__', {}), request('__proto__', 'toString', {})]) {
    assert.equal((await runDentalAction(input, access, ['practice_a'], t.call, now)).status, 400)
  }
  assert.equal(t.calls.length, 0)
})

test('unavailable practice data prevents every write', async () => {
  const call = async () => ({ ok: false, status: 502, error: 'Connection unavailable' })
  assert.equal((await runDentalAction(request('state', 'patient', { id: 'patient_practice_a', consent: false }), access, ['practice_a'], call, now)).status, 502)
})

test('JSON body limits count bytes and reject malformed data', async () => {
  const make = body => new Request('http://localhost/api', { method: 'POST', body })
  assert.equal((await readJsonBody(make('{"hello":"world"}'))).ok, true)
  assert.equal((await readJsonBody(make('{broken'))).status, 400)
  assert.equal((await readJsonBody(make(JSON.stringify('é'.repeat(100))), 150)).status, 413)
  assert.equal((await readJsonBody(make('x'.repeat(17000)))).status, 413)
})
