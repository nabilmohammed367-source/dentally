// Explicit opt-in: creates one clearly labelled synthetic patient and cancelled
// test appointments in the selected LOCAL practice. Never contacts a patient.
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'

if (process.env.DENTALOS_RUN_LOCAL_TEST !== 'yes') throw new Error('Set DENTALOS_RUN_LOCAL_TEST=yes to authorize local synthetic writes.')
if (!process.env.DENTALOS_TEST_ENV_FILE) throw new Error('Provide DENTALOS_TEST_ENV_FILE without printing its contents.')
process.loadEnvFile(process.env.DENTALOS_TEST_ENV_FILE)
const base = new URL(process.env.DENTALOS_WEBHOOK_BASE_URL)
assert.ok(['localhost', '127.0.0.1'].includes(base.hostname), 'This test is local only')
const { callN8n, ALLOWED_PRACTICES } = await import('../lib/n8n-server.ts')
const { runDentalAction, getDentalStore } = await import('../lib/dentalos-service.ts')
const practiceId = 'prac_riverside'
const access = { status: 'ready', practiceId, role: 'owner' }
const run = (workflow, action, payload) => runDentalAction({ workflow, action, payload, practice_id: practiceId }, access, ALLOWED_PRACTICES, callN8n)
const snapshot = async () => {
  const r = await getDentalStore(access, ALLOWED_PRACTICES, callN8n)
  assert.equal(r.status, 200)
  return r.body.store.practices[0]
}
const report = { started: new Date().toISOString(), practiceId, checks: [], patientId: null, appointmentIds: [], status: 'running' }
const save = () => writeFileSync('.codex-backup/live-booking-result.json', JSON.stringify(report, null, 2), { mode: 0o600 })
function check(ok, name) { assert.ok(ok, name); report.checks.push(name); save(); console.log('PASS ' + name) }
const otherBefore = {}
for (const id of ALLOWED_PRACTICES.filter(id => id !== practiceId)) {
  const r = await callN8n('ava', 'availability', { date: '2026-11-02' }, id)
  assert.ok(r.ok)
  otherBefore[id] = JSON.stringify(r.body.store)
}
const label = 'DentalOS QA Synthetic ' + Date.now()
try {
  const registration = await run('ava', 'register-patient', { name: label, phone: 'TEST-NO-CONTACT' })
  check(registration.status === 200 && registration.body.success === true, 'synthetic patient registration')
  const p = await snapshot()
  const patient = p.patients.find(x => x.name === label)
  assert.ok(patient)
  report.patientId = patient.id; save()
  const consent = await run('state', 'patient', { id: patient.id, consent: false })
  check(consent.body.success === true, 'test patient opted out of reminders')
  check((await run('ava', 'register-patient', { name: label, phone: 'TEST-NO-CONTACT' })).status === 409, 'duplicate registration blocked')
  const start = new Date(); start.setUTCDate(start.getUTCDate() + 7)
  while ([0, 6].includes(start.getUTCDay())) start.setUTCDate(start.getUTCDate() + 1)
  let date = start.toISOString().slice(0, 10)
  while (p.appointments.some(a => a.date === date && a.status !== 'Cancelled')) {
    start.setUTCDate(start.getUTCDate() + 1)
    while ([0, 6].includes(start.getUTCDay())) start.setUTCDate(start.getUTCDate() + 1)
    date = start.toISOString().slice(0, 10)
  }
  const appointment = { patientId: patient.id, date, time: '10:00', treatment: 'Check-up' }
  const bad = await callN8n('ava', 'preview', { appointment: { ...appointment, patientId: 'qa_patient_does_not_exist' } }, practiceId)
  check(bad.ok && bad.body.success === false, 'workflow independently rejects unknown patient')
  const late = await callN8n('ava', 'preview', { appointment: { ...appointment, time: '19:00' } }, practiceId)
  check(late.ok && late.body.success === false, 'workflow independently rejects closed hours')
  const booked = await run('ava', 'book', { appointment })
  check(booked.status === 200 && booked.body.success === true, 'booking saved through dashboard service')
  const visit = (await snapshot()).appointments.find(a => a.patientId === patient.id && a.status === 'Confirmed')
  assert.ok(visit); report.appointmentIds.push(visit.id); save()
  check(visit.date === date && visit.time === '10:00' && visit.duration === 30, 'fresh snapshot confirms booked time and duration')
  check((await run('ava', 'book', { appointment })).status === 409, 'dashboard rejects duplicate overlapping booking')
  const duplicate = await callN8n('ava', 'preview', { appointment }, practiceId)
  check(duplicate.ok && duplicate.body.success === false, 'workflow rejects duplicate independently')
  const moved = await run('ava', 'book', { appointment: { ...appointment, id: visit.id, time: '11:00' } })
  check(moved.body.success === true, 'reschedule succeeds')
  const afterMove = (await snapshot()).appointments.find(a => a.id === visit.id)
  check(afterMove.time === '11:00' && afterMove.duration === visit.duration && afterMove.provider === visit.provider && afterMove.chair === visit.chair, 'reschedule preserves duration, dentist and chair')
  const cancelled = await run('ava', 'cancel', { appointmentId: visit.id })
  check(cancelled.body.success === true, 'cancellation succeeds')
  check((await snapshot()).appointments.find(a => a.id === visit.id).status === 'Cancelled', 'cancellation persisted')
  check((await run('ava', 'cancel', { appointmentId: visit.id })).status === 409, 'repeat cancellation rejected')
  const simultaneous = await Promise.all([1, 2].map(() => callN8n('ava', 'preview', { appointment: { ...appointment, time: '12:00' } }, practiceId)))
  const concurrentVisits = (await snapshot()).appointments.filter(a => a.patientId === patient.id && a.status === 'Confirmed')
  report.appointmentIds.push(...concurrentVisits.map(a => a.id)); save()
  check(simultaneous.every(r => r.ok) && simultaneous.filter(r => r.body.success === true).length === 1 && concurrentVisits.length === 1, 'simultaneous overlapping requests create exactly one booking')
  for (const a of concurrentVisits) assert.equal((await run('ava', 'cancel', { appointmentId: a.id })).body.success, true)
  check(!(await snapshot()).appointments.some(a => a.patientId === patient.id && a.status !== 'Cancelled'), 'all synthetic appointments left cancelled')
  for (const [id, before] of Object.entries(otherBefore)) {
    const r = await callN8n('ava', 'availability', { date: '2026-11-02' }, id)
    check(r.ok && JSON.stringify(r.body.store) === before, 'other practice snapshot unchanged: ' + id)
  }
  report.status = 'passed'; save()
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, syntheticPatientsCreated: 1, appointmentsLeftCancelled: report.appointmentIds.length }))
} catch (e) {
  report.status = 'failed'; report.error = e.message; save()
  // Cancel only this run's synthetic visits, leaving records available for review.
  if (report.patientId) for (const a of (await snapshot()).appointments.filter(a => a.patientId === report.patientId && ['Confirmed', 'Arrived'].includes(a.status))) await run('ava', 'cancel', { appointmentId: a.id })
  throw e
}
