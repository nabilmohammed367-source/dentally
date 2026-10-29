import { z } from 'zod'

export const appointmentSchema = z.object({ id: z.string(), patientId: z.string(), date: z.string(), time: z.string(), duration: z.number(), provider: z.string(), chair: z.string(), treatment: z.string(), status: z.enum(['Confirmed', 'Arrived', 'Completed', 'Cancelled']), source: z.string() })
export const patientSchema = z.object({ id: z.string(), name: z.string(), email: z.string(), phone: z.string(), notes: z.string(), consent: z.boolean(), recall: z.boolean(), waitlist: z.boolean() })
export const messageSchema = z.object({ id: z.string(), role: z.enum(['patient', 'agent', 'staff', 'system']), text: z.string() })
export const conversationSchema = z.object({ id: z.string(), patientId: z.string(), channel: z.enum(['WhatsApp', 'Phone', 'Web']), status: z.enum(['Agent handling', 'Needs attention', 'Staff handling', 'Resolved']), assigned: z.string(), messages: z.array(messageSchema) })
export const agentSchema = z.object({ id: z.string(), name: z.string(), role: z.string(), description: z.string(), enabled: z.boolean(), faq: z.string(), handled: z.number() })
export const approvalSchema = z.object({ id: z.string(), title: z.string(), description: z.string(), kind: z.enum(['reminder', 'recall', 'waitlist', 'followup', 'summary', 'urgent']), patientIds: z.array(z.string()), agentId: z.string(), status: z.enum(['Pending', 'Approved', 'Rejected']), conversationId: z.string().optional() })
export const practiceSchema = z.object({ id: z.string(), name: z.string(), location: z.string(), timezone: z.string(), opens: z.string(), closes: z.string(), approvalRequired: z.boolean(), staffRole: z.string(), patients: z.array(patientSchema), appointments: z.array(appointmentSchema), conversations: z.array(conversationSchema), agents: z.array(agentSchema), approvals: z.array(approvalSchema), activity: z.array(z.object({ id: z.string(), title: z.string(), detail: z.string(), agent: z.string() })), recipes: z.record(z.string(), z.boolean()) })
export const storeSchema = z.object({ version: z.literal(1), activeId: z.string(), practices: z.array(practiceSchema).length(3) }).refine(s => s.practices.some(p => p.id === s.activeId) && new Set(s.practices.map(p => p.id)).size === 3 && s.practices.every(p => {
  const patientIds = new Set(p.patients.map(patient => patient.id))
  const requiredAgents = ['reception', 'support', 'reminders', 'waitlist', 'followup', 'operations']
  return p.patients.length >= 4 && patientIds.size === p.patients.length && requiredAgents.every(id => p.agents.some(a => a.id === id)) && p.agents.length === 6 && p.appointments.every(a => patientIds.has(a.patientId)) && p.conversations.every(c => patientIds.has(c.patientId)) && p.approvals.every(a => a.patientIds.every(id => patientIds.has(id)))
}))
// Live mode: real practices can have any number of patients, and n8n data is cleaned before
// parsing (see demo-provider), so one bad record never blanks the whole dashboard.
export const liveStoreSchema = z.object({ version: z.literal(1), activeId: z.string(), practices: z.array(practiceSchema).min(1) })
export type Appointment = z.infer<typeof appointmentSchema>
export type Patient = z.infer<typeof patientSchema>
export type Conversation = z.infer<typeof conversationSchema>
export type Agent = z.infer<typeof agentSchema>
export type Approval = z.infer<typeof approvalSchema>
export type Practice = z.infer<typeof practiceSchema>
export type Store = z.infer<typeof storeSchema>
export type View = 'Overview' | 'Appointments' | 'Inbox' | 'Patients' | 'AI agents' | 'Automations' | 'Settings'
export type Scenario = 'booking' | 'reschedule' | 'cancellation' | 'faq' | 'optout' | 'urgent'
// DentalOS practice dates use Amsterdam wall-clock time, not the host's UTC date.
const amsterdamDate = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit',
}).formatToParts(new Date()).map(part => [part.type, part.value]))
export const DEMO_DATE = `${amsterdamDate.year}-${amsterdamDate.month}-${amsterdamDate.day}`
export const providers = ['Dr. van Dijk', 'Dr. Mulder']
export const treatments = ['Check-up', 'Cleaning', 'Filling', 'Whitening']
// Lists for one practice: the defaults plus anything already in its schedule (live data can differ).
export function practiceProviders(p: { appointments: { provider: string }[] }) { return Array.from(new Set([...providers, ...p.appointments.map(a => a.provider).filter(Boolean)])) }
export function practiceTreatments(p: { appointments: { treatment: string }[] }) { return Array.from(new Set([...treatments, ...p.appointments.map(a => a.treatment).filter(Boolean)])) }
export function timeGreeting(timezone = 'Europe/Amsterdam') { let h = 12; try { h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: timezone }).format(new Date())) } catch {} return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening' }
export function uid() { return crypto.randomUUID() }
// Initials that skip Dutch name particles: 'Sanne de Vries' -> 'SV', 'Dr. van Dijk' -> 'VD'
export function initials(name: string) { const parts = name.replace('Dr. ', '').split(' ').filter(Boolean); const main = parts.filter(p => !['de', 'van', 'der', 'den', 'het', 'ten', 'ter', 'te', 'el', 'al'].includes(p.toLowerCase())); const use = main.length ? main : parts; return ((use[0]?.[0] || '') + (use.length > 1 ? use[use.length - 1][0] : '')).toUpperCase() }
// The practice's working day: today, or the next Monday when today is a weekend.
export const WORK_DATE = (() => { const d = new Date(DEMO_DATE + 'T12:00:00Z'); while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10) })()
export const IS_WEEKEND = WORK_DATE !== DEMO_DATE
export function dayLabel(date: string, short = false) { return new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: short ? 'short' : 'long', month: 'short', day: 'numeric' }) }
export function moveDate(date: string, amount: number) { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + amount); return d.toISOString().slice(0, 10) }
