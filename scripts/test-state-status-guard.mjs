import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const workflow = JSON.parse(readFileSync(process.argv[2], 'utf8'))[0]
const code = workflow.nodes.find(n => n.name === 'Validate Status Transition').parameters.jsCode
const time = Date.parse('2026-11-05T09:00:00Z') // 10:00 Amsterdam
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [time])) }
  static now() { return time }
}
const run = (row, target) => vm.runInNewContext(`(function(){${code}})()`, {
  Date: FixedDate, Intl, Number, Object, String,
  $input: { all: () => [{ json: row }] },
  $: () => ({ first: () => ({ json: { practice_id: 'prac_riverside', payload: { id: 'appt_test', status: target } } }) }),
})
const base = { appointment_id: 'appt_test', practice_id: 'prac_riverside', status: 'Confirmed', start_time: '2026-11-05 09:30:00.000' }
assert.equal(run(base, 'Arrived')[0].json.payload.status, 'Arrived')
assert.equal(run({ ...base, status: 'Arrived' }, 'Completed')[0].json.payload.status, 'Completed')
for (const [row, target] of [
  [{ ...base, start_time: '2026-11-06 15:00:00.000' }, 'Arrived'],
  [{ ...base, status: 'Arrived', start_time: '2026-11-05 11:00:00.000' }, 'Completed'],
  [{ ...base, status: 'Completed' }, 'Arrived'],
  [{ ...base, practice_id: 'prac_harbor' }, 'Arrived'],
  [{ ...base, start_time: 'invalid' }, 'Arrived'],
]) assert.throws(() => run(row, target))
const route = workflow.connections['Route Action'].main[2][0].node
assert.equal(route, 'Get Appointment Before Status')
assert.equal(workflow.connections['Get Appointment Before Status'].main[0][0].node, 'Validate Status Transition')
assert.equal(workflow.connections['Validate Status Transition'].main[0][0].node, 'Update Appointment Status')
console.log('PASS status transitions enforce practice, date, and order before the data-table update')
