import { DEMO_DATE, providers, treatments, uid, type Appointment, type Approval, type Practice } from './types'

export function log(p: Practice, title: string, detail: string, agent = 'Staff') {
  p.activity.unshift({ id: uid(), title, detail, agent }); p.activity = p.activity.slice(0, 100)
}
export function minutes(value: string) { const [h, m] = value.split(':').map(Number); return h * 60 + m }
export function validateAppointment(p: Practice, a: Appointment) {
  if (!p.patients.some(v => v.id === a.patientId)) throw new Error('Choose a patient from this practice.')
  if (!providers.includes(a.provider) || !['Chair 1', 'Chair 2', 'Chair 3'].includes(a.chair) || !treatments.includes(a.treatment)) throw new Error('Choose a valid provider, chair and treatment.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date) || Number.isNaN(Date.parse(a.date)) || new Date(a.date).toISOString().slice(0, 10) !== a.date || a.date < DEMO_DATE) throw new Error('Choose a valid date on or after the demo date.')
  if ([0, 6].includes(new Date(a.date + 'T12:00:00Z').getUTCDay())) throw new Error('The practice is closed on weekends.')
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(a.time) || ![15, 30, 45, 60, 90].includes(a.duration)) throw new Error('Select a valid time and duration.')
  const start = minutes(a.time)
  if (start < minutes(p.opens) || start + a.duration > minutes(p.closes)) throw new Error(`Appointments must fit within ${p.opens}–${p.closes} (${p.timezone}).`)
  if (p.appointments.some(other => other.id !== a.id && other.date === a.date && other.status !== 'Cancelled' && (other.provider === a.provider || other.chair === a.chair) && start < minutes(other.time) + other.duration && start + a.duration > minutes(other.time))) throw new Error('That provider or chair is already booked. Please choose another time.')
}
export function saveAppointment(p: Practice, a: Appointment) {
  const previous = p.appointments.find(v => v.id === a.id)
  if (previous && ['Cancelled', 'Completed'].includes(previous.status)) throw new Error('This appointment is closed. Create a new booking instead.')
  validateAppointment(p, a)
  if (previous) Object.assign(previous, a); else p.appointments.push(a)
  log(p, previous ? 'Appointment rescheduled' : 'Appointment booked', `${p.patients.find(v => v.id === a.patientId)?.name} · ${a.date}, ${a.time}`, a.source)
}
export function changeStatus(p: Practice, id: string, status: Appointment['status']) {
  const a = p.appointments.find(v => v.id === id)
  if (!a || ['Completed', 'Cancelled'].includes(a.status)) throw new Error('This appointment is no longer available for changes.')
  if (status === 'Completed' && a.status !== 'Arrived') throw new Error('Mark the patient as arrived first.')
  a.status = status; log(p, `Appointment ${status.toLowerCase()}`, `${p.patients.find(v => v.id === a.patientId)?.name} · ${a.time}`)
}
export const recipes: { id: Exclude<Approval['kind'], 'urgent'>; name: string; description: string; agentId: string }[] = [
  { id: 'reminder', name: 'Appointment reminders', description: 'A friendly reminder for upcoming appointments, with a simple way to reply.', agentId: 'reminders' },
  { id: 'recall', name: 'Bring patients back to care', description: 'Invite overdue patients to arrange their next routine visit.', agentId: 'reminders' },
  { id: 'waitlist', name: 'Make room for the waitlist', description: 'Invite interested patients to discuss recently available appointments.', agentId: 'waitlist' },
  { id: 'followup', name: 'A thoughtful follow-up', description: 'Check whether patients need administrative help after a completed visit.', agentId: 'followup' },
  { id: 'summary', name: 'Daily practice briefing', description: 'Turn appointments, open conversations and handoffs into a staff summary.', agentId: 'operations' },
]
export function recipients(p: Practice, kind: Approval['kind']) {
  return p.patients.filter(patient => patient.consent && (kind === 'recall' ? patient.recall : kind === 'waitlist' ? patient.waitlist : kind === 'followup' ? p.appointments.some(a => a.patientId === patient.id && a.status === 'Completed') : kind === 'reminder' ? p.appointments.some(a => a.patientId === patient.id && a.date >= DEMO_DATE && a.status === 'Confirmed') : false)).map(v => v.id)
}
export function proposeRecipe(p: Practice, kind: Approval['kind']) {
  const recipe = recipes.find(v => v.id === kind)
  if (!recipe || !p.recipes[kind]) throw new Error('This recipe is paused.')
  if (!p.agents.find(v => v.id === recipe.agentId)?.enabled) throw new Error('Enable the assigned agent before running this simulation.')
  if (p.approvals.some(a => a.kind === kind && a.status === 'Pending')) throw new Error('A proposal is already awaiting review. Open the approval queue.')
  const ids = recipients(p, kind)
  if (kind !== 'summary' && !ids.length) throw new Error('No eligible patients. Communication opt-outs are respected.')
  const a: Approval = { id: uid(), kind, title: recipe.name, description: kind === 'summary' ? 'Prepare an operational summary for staff. No patient messages.' : `Preview: ${kind === 'recall' ? 'You are due for a routine visit. Contact us to find a suitable time.' : kind === 'waitlist' ? 'An appointment may be available. Reply to discuss a suitable slot; no booking is made automatically.' : kind === 'followup' ? 'Thank you for visiting. Contact the practice if you need administrative help; clinical concerns go to the dental team.' : 'A reminder of your upcoming appointment. Contact the practice if you need to make changes.'}`, patientIds: ids, agentId: recipe.agentId, status: 'Pending' }
  p.approvals.unshift(a); log(p, 'Automation prepared for review', `${recipe.name} · ${ids.length} eligible recipients`, p.agents.find(v => v.id === recipe.agentId)!.name)
}
export function decideApproval(p: Practice, id: string, approve: boolean) {
  const a = p.approvals.find(v => v.id === id)
  if (!a || a.status !== 'Pending') throw new Error('This proposal has already been processed.')
  const agent = p.agents.find(v => v.id === a.agentId)
  if (approve && a.kind !== 'urgent' && !agent?.enabled) throw new Error('The assigned agent is paused.')
  if (approve && a.kind !== 'urgent' && !p.recipes[a.kind]) throw new Error('This automation is paused.')
  a.status = approve ? 'Approved' : 'Rejected'
  if (approve && a.kind === 'urgent') {
    const c = p.conversations.find(v => v.id === a.conversationId)
    if (c) { c.status = 'Staff handling'; c.assigned = 'Dr. Emma Wilson'; c.messages.push({ id: uid(), role: 'system', text: 'Staff accepted this handoff. A clinician must review before any clinical reply.' }) }
  } else if (approve && a.kind === 'summary') {
    log(p, 'Daily briefing prepared', `${p.appointments.filter(v => v.date === DEMO_DATE && v.status !== 'Cancelled').length} appointments · ${p.conversations.filter(v => v.status !== 'Resolved').length} open conversations · ${p.approvals.filter(v => v.status === 'Pending').length} pending reviews`, agent?.name)
  } else if (approve) {
    const eligible = new Set(recipients(p, a.kind))
    const ids = a.patientIds.filter(id => eligible.has(id))
    for (const patientId of ids) {
      p.conversations.unshift({ id: uid(), patientId, channel: 'WhatsApp', status: 'Agent handling', assigned: agent?.name ?? 'Agent', messages: [{ id: uid(), role: 'agent', text: a.description.replace('Preview: ', '') }, { id: uid(), role: 'system', text: 'Demo message only. Nothing was delivered externally.' }] })
    }
    if (agent) agent.handled += ids.length
    log(p, 'Outreach simulated', `${ids.length} messages prepared; ${a.patientIds.length - ids.length} recipients skipped after eligibility recheck.`, agent?.name)
  }
  log(p, `Proposal ${approve ? 'approved' : 'rejected'}`, a.title)
}
