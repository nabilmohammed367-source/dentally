import { z } from 'zod'

const recordId = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
const shortText = z.string().trim().min(1).max(1500)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

const appointment = z.object({
  patientId: recordId,
  treatment: z.string().trim().min(1).max(120),
  date,
  time,
  id: recordId.optional(),
}).strict()

const policies = {
  ava: {
    availability: z.object({ date }).strict(),
    preview: z.object({ appointment }).strict(),
    'cancel-preview': z.object({ appointmentId: recordId }).strict(),
    confirm: z.object({ token: z.string().trim().min(1).max(500) }).strict(),
    'register-patient': z.object({
      name: z.string().trim().min(2).max(160),
      phone: z.string().trim().min(5).max(40),
      email: z.string().trim().email().max(254).optional(),
    }).strict(),
  },
  milo: {
    faq: z.object({ patientId: recordId, text: shortText }).strict(),
    human: z.object({ patientId: recordId, text: shortText }).strict(),
    urgent: z.object({ patientId: recordId, text: shortText }).strict(),
    message: z.object({ patientId: recordId, text: shortText }).strict(),
    optout: z.object({ patientId: recordId, text: shortText }).strict(),
  },
  luna: { preview: z.object({ kind: z.enum(['reminder', 'recall']) }).strict() },
  finn: { invite: z.object({ appointmentId: recordId }).strict() },
  iris: { prepare: z.object({}).strict() },
  leo: { briefing: z.object({}).strict() },
  approvals: { decide: z.object({ id: recordId, approve: z.boolean() }).strict() },
  state: {
    agent: z.object({ id: z.enum(['reception', 'support', 'reminders', 'waitlist', 'followup', 'operations']), enabled: z.boolean() }).strict(),
    status: z.object({ id: recordId, status: z.enum(['Confirmed', 'Arrived', 'Completed', 'Cancelled']) }).strict(),
    conversation: z.object({ id: recordId, status: z.enum(['Staff handling', 'Resolved']), text: shortText }).strict(),
    patient: z.object({ id: recordId, consent: z.boolean() }).strict(),
    settings: z.object({
      name: z.string().trim().min(1).max(120),
      timezone: z.string().trim().min(1).max(80).refine(value => {
        try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return true } catch { return false }
      }, 'Invalid timezone'),
    }).strict(),
    recipe: z.object({ id: z.enum(['reminder', 'recall', 'waitlist', 'followup', 'summary']), enabled: z.boolean() }).strict(),
  },
} as const

export function validateDentalAction(workflow: string, action: string, payload: unknown) {
  const workflowPolicies = policies as unknown as Record<string, Record<string, z.ZodType>>
  const schema = workflowPolicies[workflow]?.[action]
  if (!schema) return { success: false as const }
  return schema.safeParse(payload)
}

const managerOnlyActions = new Set([
  'approvals:decide',
  'state:agent',
  'state:recipe',
  'state:settings',
])

export function canRunDentalAction(role: string, workflow: string, action: string) {
  const workflowPolicies = policies as unknown as Record<string, Record<string, z.ZodType>>
  if (!workflowPolicies[workflow]?.[action]) return false
  if (managerOnlyActions.has(`${workflow}:${action}`)) return role === 'owner' || role === 'admin'
  return role === 'owner' || role === 'admin' || role === 'staff'
}
