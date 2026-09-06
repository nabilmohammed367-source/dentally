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
export type Appointment = z.infer<typeof appointmentSchema>
export type Patient = z.infer<typeof patientSchema>
export type Conversation = z.infer<typeof conversationSchema>
export type Agent = z.infer<typeof agentSchema>
export type Approval = z.infer<typeof approvalSchema>
export type Practice = z.infer<typeof practiceSchema>
export type Store = z.infer<typeof storeSchema>
export type View = 'Overview' | 'Appointments' | 'Inbox' | 'Patients' | 'AI agents' | 'Automations' | 'Settings'
export type Scenario = 'booking' | 'reschedule' | 'cancellation' | 'faq' | 'optout' | 'urgent'
export const DEMO_DATE = '2026-09-07'
export const providers = ['Dr. Emma Wilson', 'Dr. James Chen', 'Dr. Sarah Patel']
export const treatments = ['Routine check-up', 'Dental cleaning', 'Consultation', 'Follow-up visit', 'Crown fitting']
export function uid() { return crypto.randomUUID() }
export function initials(name: string) { return name.replace('Dr. ', '').split(' ').map(n => n[0]).slice(0, 2).join('') }
export function dayLabel(date: string, short = false) { return new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: short ? 'short' : 'long', month: 'short', day: 'numeric' }) }
export function moveDate(date: string, amount: number) { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + amount); return d.toISOString().slice(0, 10) }
