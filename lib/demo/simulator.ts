import { DEMO_DATE, providers, uid, type Practice, type Scenario } from './types'
import { changeStatus, log, saveAppointment } from './operations'

export const scenarios: { id: Scenario; label: string; prompt: string }[] = [
  { id: 'booking', label: 'Book an appointment', prompt: 'I would like to book a routine check-up.' },
  { id: 'reschedule', label: 'Reschedule a visit', prompt: 'Could I move my upcoming appointment?' },
  { id: 'cancellation', label: 'Cancel an appointment', prompt: 'I would like to cancel my upcoming visit.' },
  { id: 'faq', label: 'Answer a question', prompt: 'What should I bring to my appointment?' },
  { id: 'optout', label: 'Stop reminders', prompt: 'Please stop sending me reminders.' },
  { id: 'urgent', label: 'Escalate an urgent concern', prompt: 'I am experiencing severe swelling and trouble breathing.' },
]
export function simulate(p: Practice, scenario: Scenario, patientId: string, time: string, channel: 'WhatsApp' | 'Phone' | 'Web', agentId: string) {
  const agent = p.agents.find(v => v.id === agentId)
  if (!agent?.enabled) throw new Error('This agent is paused. Enable it to run a simulation.')
  const patient = p.patients.find(v => v.id === patientId)
  if (!patient) throw new Error('Select a fictional patient from this practice.')
  let reply = ''
  const appointment = p.appointments.find(a => a.patientId === patientId && a.date >= DEMO_DATE && a.status === 'Confirmed')
  if (scenario === 'booking' || scenario === 'reschedule') {
    if (scenario === 'reschedule' && !appointment) throw new Error('This patient has no confirmed appointment to reschedule.')
    const a = scenario === 'reschedule' ? { ...appointment!, time } : { id: uid(), patientId, date: DEMO_DATE, time, duration: 30, provider: providers[0], chair: 'Chair 1', treatment: 'Routine check-up', status: 'Confirmed' as const, source: agent.name }
    saveAppointment(p, { ...a, source: agent.name }); reply = `Confirmed in the demo calendar: ${a.treatment} on ${a.date} at ${a.time}, ${p.timezone}, with ${a.provider}. Your explicit confirmation was recorded through the scenario form.`
  } else if (scenario === 'cancellation') {
    if (!appointment) throw new Error('This patient has no confirmed appointment to cancel.')
    changeStatus(p, appointment.id, 'Cancelled'); reply = 'Your selected appointment has been cancelled in the demo calendar, following your confirmation.'
  } else if (scenario === 'optout') {
    patient.consent = false; reply = 'Your communication preference has been updated. Future reminder and outreach simulations will skip you.'
  } else if (scenario === 'urgent') {
    reply = 'Trouble breathing can be an emergency. Seek immediate help from your local emergency services now; do not wait for a reply here. I have also flagged this conversation for the practice team. This demo cannot contact emergency services or provide a diagnosis.'
  } else reply = agent.faq
  const conversationId = uid()
  p.conversations.unshift({ id: conversationId, patientId, channel, status: scenario === 'urgent' ? 'Needs attention' : 'Agent handling', assigned: scenario === 'urgent' ? 'Unassigned' : agent.name, messages: [{ id: uid(), role: 'patient', text: scenarios.find(v => v.id === scenario)!.prompt }, { id: uid(), role: 'agent', text: reply }, { id: uid(), role: 'system', text: 'Simulated scenario. No real call or message was sent.' }] })
  if (scenario === 'urgent') p.approvals.unshift({ id: uid(), title: 'Urgent concern — staff review required', description: `${patient.name}: urgent symptoms reported. Emergency guidance was displayed; this is not a diagnosis and no emergency service was contacted.`, kind: 'urgent', patientIds: [patientId], agentId, status: 'Pending', conversationId })
  agent.handled++; log(p, scenarios.find(v => v.id === scenario)!.label + ' · simulated', patient.name, agent.name)
}
