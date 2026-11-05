import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const workflows = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const node = (workflowId, name) => workflows.find(w => w.id === workflowId).nodes.find(n => n.name === name)
const core = '2pX6Hu21KkF0mHYW', bridge = 'XmHlRHlJSRZ7OAnS'
const now = Date.parse('2026-11-05T12:00:00Z')
class FixedDate extends Date { static now() { return now } }
const evaluate = (code, inputs, named = {}) => vm.runInNewContext(`(function(){${code}})()`, {
  Date: FixedDate,
  Number,
  Set,
  $input: { first: () => ({ json: inputs[0] }), all: () => inputs.map(json => ({ json })) },
  $: name => ({ all: () => (named[name] ?? []).map(json => ({ json })) }),
})[0].json
const guard = node(core, 'Guard Recent Completed Visit').parameters.jsCode
for (const [status, end_time, expected] of [
  ['Completed', '2026-11-05T10:00:00Z', true],
  ['Completed', '2026-10-07T10:00:00Z', false],
  ['Completed', '2026-11-06T16:00:00Z', false],
  ['Confirmed', '2026-11-05T10:00:00Z', false],
  ['Completed', 'invalid', false],
]) assert.equal(evaluate(guard, [{ status, end_time }]).eligible_followup, expected)

const select = node(bridge, 'Find Eligible Appointment').parameters.jsCode
const appointments = [
  { appointment_id: 'old', status: 'Completed', end_time: '2026-10-07T10:00:00Z' },
  { appointment_id: 'future', status: 'Completed', end_time: '2026-11-06T16:00:00Z' },
  { appointment_id: 'recent1', status: 'Completed', end_time: '2026-11-05T09:00:00Z' },
  { appointment_id: 'recent2', status: 'Completed', end_time: '2026-11-05T10:00:00Z' },
]
const choice = events => evaluate(select, events, { 'Get Appointments (Prepare)': appointments })
assert.equal(choice([]).appointment_id, 'recent2')
assert.equal(choice([{ event_id: 'e1', type: 'followup_sent', related_id: 'recent2' }]).appointment_id, 'recent1')
assert.equal(choice([
  { event_id: 'e1', type: 'followup_sent', related_id: 'recent1' },
  { event_id: 'e2', type: 'followup_sent', related_id: 'recent2' },
]).found, false)
assert.equal(node(core, 'Insert New Conversation (Followup)').parameters.columns.value.channel, 'Web')
const response = node(core, 'Followup Sent Response').parameters.assignments.assignments.find(a => a.name === 'response').value
assert.ok(response.includes('Follow-up prepared for '))
assert.ok(!response.includes('Follow-up sent to '))
console.log('PASS Iris recent-visit guard, newest selection, duplicate skip, dashboard-only channel, and honest response')
