import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const file = process.argv[2]
if (!file) throw new Error('Pass the prepared candidate.json path.')
const workflows = JSON.parse(readFileSync(file, 'utf8'))
let assertions = 0
function check(condition, label) { assert.ok(condition, label); assertions++ }
function execute(code, sources, input = []) {
  const wrap = values => values.map(json => ({ json }))
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-11-02T07:00:00Z'])) }
    static now() { return new Date('2026-11-02T07:00:00Z').getTime() }
  }
  return vm.runInNewContext(`(function () { ${code}\n})()`, {
    $: name => ({ all: () => wrap(sources[name] ?? []), first: () => ({ json: sources[name]?.[0] ?? {} }) }),
    $input: { all: () => wrap(input), first: () => ({ json: input[0] ?? {} }) },
    $json: input[0] ?? {},
    Date: FixedDate,
  }, { timeout: 1000, contextCodeGeneration: { strings: false, wasm: false } })
}
for (const w of workflows) {
  const names = new Set(w.nodes.map(n => n.name))
  check(names.size === w.nodes.length, `${w.name}: unique node names`)
  check(w.active === false, `${w.name}: candidate imports inactive`)
  for (const [source, ports] of Object.entries(w.connections)) {
    check(names.has(source), 'connection source exists')
    for (const outputs of Object.values(ports)) for (const edges of outputs) for (const edge of edges) check(names.has(edge.node), 'connection target exists')
  }
  for (const n of w.nodes) {
    if (n.type.endsWith('.code')) new vm.Script(`(async function () { ${n.parameters.jsCode}\n})`)
    if (n.type.endsWith('.dataTable') && ['get', 'update', 'deleteRows', 'upsert'].includes(n.parameters.operation)) {
      check(n.parameters.matchType === 'allConditions', `${n.name}: practice condition uses AND`)
      check(n.parameters.filters.conditions.some(c => c.keyName === 'practice_id' && /Validate (Request|Practice Scope)/.test(c.keyValue)), `${n.name}: authoritative practice filter`)
      if (n.parameters.operation === 'get') check(n.parameters.returnAll === true, `${n.name}: no silent row truncation`)
    }
    if (n.name === 'Validate Practice Scope') {
      for (const input of [{}, { practice_id: '' }, { practice_id: '../other' }]) {
        assert.throws(() => execute(n.parameters.jsCode, {}, [input])); assertions++
      }
      check(execute(n.parameters.jsCode, {}, [{ practice_id: 'practice_a' }])[0].json.practice_id === 'practice_a', 'valid scope preserved')
    }
  }
}
const snapshot = workflows.find(w => w.id === 'Af4fnEAm3H6sYt6x')
const code = snapshot.nodes.find(n => n.name === 'Build Snapshot 1').parameters.jsCode
const sources = {
  'Validate Practice Scope': [{ practice_id: 'practice_a' }],
  'Get All Practices': [{ practice_id: 'practice_a', name: 'Synthetic A', timezone: 'Europe/Amsterdam' }, { practice_id: 'practice_b', name: 'Synthetic B', timezone: 'Europe/Amsterdam' }],
  'Get All Patients': Array.from({ length: 125 }, (_, i) => ({ patient_id: `patient_${i}`, practice_id: 'practice_a', name: 'Synthetic', phone: '' })).concat([{ patient_id: 'foreign', practice_id: 'practice_b', name: 'Foreign', phone: 'private' }]),
  'Get All Conversations': [{ conversation_id: 'c_a', practice_id: 'practice_a', patient_id: 'patient_0', channel: 'Web', status: 'Staff handling', last_message: 'Staff note' }],
}
const store = execute(code, sources)[0].json.store
check(store.practices.length === 1 && store.activeId === 'practice_a', 'snapshot scopes mixed practice input')
check(store.practices[0].patients.length === 125, 'snapshot retains more than 100 patients')
check(store.practices[0].patients.every(p => p.email === ''), 'snapshot does not fabricate patient email')
check(store.practices[0].conversations[0].messages[0].role === 'system', 'legacy summary is not falsely attributed to patient')
check(!JSON.stringify(store).includes('private'), 'foreign data absent')

const ava = workflows.find(w => w.id === 'e4ciAd2Eu5oO7ItT')
const confirm = ava.nodes.find(n => n.name === 'Build Envelope (Confirm)').parameters.jsCode
const req = { practice_id: 'practice_a', request_id: 'test-request' }
for (const row of [{ token: 'x', practice_id: 'practice_b', expires_at: '2099-01-01' }, { token: 'x', practice_id: 'practice_a', expires_at: 'Invalid' }, { token: 'x', practice_id: 'practice_a', expires_at: '2020-01-01' }]) {
  check(execute(confirm, { 'Validate Request': [req] }, [row])[0].json.envelope.success === false, 'foreign, invalid, or expired confirmation rejected')
}
const good = execute(confirm, { 'Validate Request': [req] }, [{ token: 'x', practice_id: 'practice_a', expires_at: '2099-01-01', payload_json: JSON.stringify({ success: true, store: { version: 1, practices: [{ id: 'practice_a' }, { id: 'practice_b' }] } }) }])[0].json.envelope
check(good.store.practices.length === 1 && good.store.practices[0].id === 'practice_a', 'old cached snapshots filtered on replay')
const core = workflows.find(w => w.id === 'lD9wKCrivHYSvF0R')
check(core.nodes.find(n => n.name === 'Get Patient (Booking Guard)').executeOnce === true, 'patient lookup runs once even when the appointment query returns multiple rows')
const bookCode = core.nodes.find(n => n.name === 'Check Slot Free').parameters.jsCode
const scenario = { practice_id: 'practice_a', patient_id: 'patient_a', preferred_date: '2026-11-03', preferred_time: '10:00' }
const bookingSources = { 'Scenario Input': [scenario], 'Get Patient (Booking Guard)': [{ practice_id: 'practice_a', patient_id: 'patient_a' }], 'Get Appointments (Booking Check)': [] }
check(execute(bookCode, bookingSources)[0].json.available === true, 'valid in-practice booking is allowed')
for (const edit of [{ preferred_date: '2026-11-07' }, { preferred_date: '2026-11-01' }, { preferred_date: '2026-02-31' }, { preferred_time: '19:00' }, { preferred_time: '16:45' }, { patient_id: 'foreign' }]) {
  const sources = { ...bookingSources, 'Scenario Input': [{ ...scenario, ...edit }] }
  check(execute(bookCode, sources)[0].json.available === false, 'core rejects unsafe date/time/patient')
}
const overlap = { appointment_id: 'visit_a', patient_id: 'patient_a', practice_id: 'practice_a', start_time: '2026-11-03T10:00:00.000Z', end_time: '2026-11-03T10:30:00.000Z', provider: 'Dr. van Dijk', chair: 'Chair 1', status: 'Confirmed' }
check(execute(bookCode, { ...bookingSources, 'Get Appointments (Booking Check)': [overlap] })[0].json.available === false, 'patient cannot double-book with another dentist')
const moveCode = core.nodes.find(n => n.name === 'Check New Slot Free').parameters.jsCode
const moved = execute(moveCode, { 'Scenario Input': [{ ...scenario, preferred_time: '11:00' }], 'Get Appointment To Reschedule': [{ ...overlap, end_time: '2026-11-03T11:00:00.000Z' }] })[0].json
check(moved.available && Date.parse(moved.new_end) - Date.parse(moved.new_start) === 60 * 60000, 'reschedule preserves a one-hour visit')
const cancelCode = core.nodes.find(n => n.name === 'Check Cancellation State').parameters.jsCode
for (const status of ['Completed', 'Cancelled']) check(!execute(cancelCode, {}, [{ ...overlap, status }])[0].json.appointment_id, 'closed visits cannot be cancelled again')
console.log(JSON.stringify({ workflows: workflows.length, assertions, status: 'passed', liveExecutions: 0 }))
