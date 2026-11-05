import assert from 'node:assert/strict'
import test from 'node:test'
import { canRunDentalAction, validateDentalAction } from '../lib/dentalos-api-policy.ts'

const patientId = 'pat_prac_riverside_1'

test('allows the dashboard workflows and exact payload shapes', () => {
  const cases = [
    ['ava', 'availability', { date: '2026-10-30' }],
    ['ava', 'book', { appointment: { patientId, treatment: 'Check-up', date: '2026-10-30', time: '09:30' } }],
    ['ava', 'cancel', { appointmentId: 'appt_123' }],
    ['milo', 'faq', { patientId, text: 'What time do you open?' }],
    ['milo', 'optout', { patientId, text: 'Stop reminders' }],
    ['luna', 'preview', { kind: 'recall' }],
    ['finn', 'invite', { appointmentId: 'appt_123' }],
    ['iris', 'prepare', {}],
    ['leo', 'briefing', {}],
    ['approvals', 'decide', { id: 'apr_123', approve: false }],
    ['state', 'agent', { id: 'reception', enabled: true }],
    ['state', 'status', { id: 'appt_123', status: 'Arrived' }],
    ['state', 'conversation', { id: 'con_123', status: 'Staff handling', text: 'Staff took over.' }],
    ['state', 'patient', { id: patientId, consent: false }],
    ['state', 'settings', { name: 'Mondzorg Utrecht', timezone: 'Europe/Amsterdam' }],
  ]

  for (const [workflow, action, payload] of cases) {
    assert.equal(validateDentalAction(workflow, action, payload).success, true, `${workflow}/${action}`)
  }
})

test('rejects unknown actions, extra payload fields, and malformed records', () => {
  const cases = [
    ['ava', 'delete-all', {}],
    ['ava', 'confirm', { token: 'foreign-token' }],
    ['state', 'recipe', { id: 'recall', enabled: false }],
    ['state', 'settings', { name: 'X', timezone: 'Europe/Amsterdam', practice_id: 'prac_other' }],
    ['state', 'agent', { id: 'reception', enabled: true, practice_id: 'prac_other' }],
    ['ava', 'book', { appointment: { patientId, treatment: 'Check-up', date: '2026-10-30', time: '25:90' } }],
    ['milo', 'faq', { patientId: '../other-tenant', text: 'Hello' }],
    ['state', 'settings', { name: 'Clinic', timezone: 'Not/AZone' }],
    ['approvals', 'decide', { id: 'apr_123', approve: 'yes' }],
  ]

  for (const [workflow, action, payload] of cases) {
    assert.equal(validateDentalAction(workflow, action, payload).success, false, `${workflow}/${action}`)
  }
})

test('limits approvals and agent, automation, and practice settings to managers', () => {
  for (const role of ['owner', 'admin']) {
    assert.equal(canRunDentalAction(role, 'approvals', 'decide'), true)
    assert.equal(canRunDentalAction(role, 'state', 'agent'), true)
    assert.equal(canRunDentalAction(role, 'state', 'settings'), true)
  }

  for (const action of ['decide', 'agent', 'recipe', 'settings']) {
    const workflow = action === 'decide' ? 'approvals' : 'state'
    assert.equal(canRunDentalAction('staff', workflow, action), false)
  }

  assert.equal(canRunDentalAction('staff', 'ava', 'book'), true)
  assert.equal(canRunDentalAction('unknown', 'ava', 'book'), false)
  assert.equal(canRunDentalAction('owner', 'ava', 'delete-all'), false)
})
