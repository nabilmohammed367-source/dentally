import { canRunDentalAction, validateDentalAction } from './dentalos-api-policy.ts'
import { practiceSchema, type Practice } from './demo/types.ts'

type Access = { status: 'ready'; practiceId: string; role: string } | { status: 'signed_out' | 'unassigned' | 'setup' | 'unavailable' }
type CallResult = { ok: true; body: any } | { ok: false; status: number; error: string }
export type WorkflowCaller = (workflow: string, action: string, payload: Record<string, unknown>, practiceId: string) => Promise<CallResult>
export type ServiceReply = { status: number; body: Record<string, any> }
const fail = (status: number, error: string): ServiceReply => ({ status, body: { error } })

function accessError(access: Access, allowed: readonly string[]) {
  if (access.status === 'signed_out') return fail(401, 'Sign in to continue.')
  if (access.status === 'unassigned') return fail(403, 'Your account has not been assigned to a practice.')
  if (access.status !== 'ready') return fail(503, 'Practice access is not configured or is temporarily unavailable.')
  if (!allowed.includes(access.practiceId)) return fail(403, 'The assigned practice is not configured in DentalOS.')
  if (!['owner', 'admin', 'staff'].includes(access.role)) return fail(403, 'Your account does not have a supported practice role.')
  return null
}

// Rebuild the response instead of spreading upstream fields into a patient's browser.
export function scopeStore(raw: any, practiceId: string) {
  if (raw?.version !== 1 || !Array.isArray(raw?.practices)) return null
  const matches = raw.practices.filter((p: any) => p?.id === practiceId)
  if (matches.length !== 1) return null
  const parsed = practiceSchema.safeParse(matches[0])
  if (!parsed.success) return null
  return { version: 1 as const, activeId: practiceId, practices: [parsed.data] }
}

function localDate(now: Date, timezone = 'Europe/Amsterdam') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(part => [part.type, part.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) }
}

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
const clockTime = /^([01]\d|2[0-3]):[0-5]\d$/

export function bookingError(p: Practice, appointment: any, now: Date): string | null {
  if (!p.patients.some(patient => patient.id === appointment.patientId)) return 'That patient is not registered at this practice.'
  const original = appointment.id ? p.appointments.find(a => a.id === appointment.id) : undefined
  if (appointment.id && !original) return 'That appointment is not available at this practice.'
  if (original && (original.patientId !== appointment.patientId || original.treatment !== appointment.treatment)) return 'Rescheduling can only change the appointment time.'
  if (original && !['Confirmed', 'Arrived'].includes(original.status)) return 'This appointment can no longer be moved.'
  const duration = original?.duration ?? 30
  if (!Number.isFinite(duration) || duration <= 0 || duration > 480) return 'This visit has an invalid duration. Ask the practice administrator to correct it.'
  if (!clockTime.test(p.opens) || !clockTime.test(p.closes)) return 'The practice opening hours need to be configured.'
  let today
  try { today = localDate(now, p.timezone) } catch { return 'The practice timezone needs to be configured.' }
  const start = minutes(appointment.time)
  if (appointment.date < today.date || (appointment.date === today.date && start <= today.minutes)) return 'That time has already passed. Please choose a future time.'
  const day = new Date(`${appointment.date}T12:00:00Z`).getUTCDay()
  if (day === 0 || day === 6) return 'The practice is closed at weekends. Please choose a weekday.'
  if (start < minutes(p.opens) || start + duration > minutes(p.closes)) return `The practice is open ${p.opens}–${p.closes}. Please choose a time inside those hours.`
  const conflict = p.appointments.some(a => {
    if (a.id === appointment.id || a.status === 'Cancelled' || a.date !== appointment.date) return false
    const overlaps = start < minutes(a.time) + a.duration && start + duration > minutes(a.time)
    return overlaps && (a.patientId === appointment.patientId || (original && (a.provider === original.provider || a.chair === original.chair)))
  })
  return conflict ? 'This appointment overlaps an existing visit for the patient, dentist, or chair.' : null
}

export function recordError(p: Practice, workflow: string, action: string, payload: any, now: Date): string | null {
  if (workflow === 'ava' && action === 'book') return bookingError(p, payload.appointment, now)
  if (workflow === 'milo' && !p.patients.some(x => x.id === payload.patientId)) return 'That patient is not available at this practice.'
  if (workflow === 'milo' && payload.conversationId && !p.conversations.some(x => x.id === payload.conversationId && x.patientId === payload.patientId)) return 'That conversation does not belong to this patient and practice.'
  if (workflow === 'ava' && action === 'cancel') {
    const a = p.appointments.find(x => x.id === payload.appointmentId)
    if (!a) return 'That appointment is not available at this practice.'
    if (!['Confirmed', 'Arrived'].includes(a.status)) return 'That appointment is already cancelled or completed.'
  }
  if (workflow === 'finn') {
    const a = p.appointments.find(x => x.id === payload.appointmentId)
    if (!a || a.status !== 'Cancelled') return 'Select a cancelled appointment from this practice.'
  }
  if (workflow === 'approvals') {
    const approval = p.approvals.find(x => x.id === payload.id)
    if (!approval || approval.patientIds.some(id => !p.patients.some(x => x.id === id))) return 'That approval is not available at this practice.'
    if (approval.status !== 'Pending') return 'That approval has already been processed.'
  }
  if (workflow === 'state') {
    if (action === 'patient' && !p.patients.some(x => x.id === payload.id)) return 'That patient is not available at this practice.'
    if (action === 'conversation' && !p.conversations.some(x => x.id === payload.id)) return 'That conversation is not available at this practice.'
    if (action === 'agent' && !p.agents.some(x => x.id === payload.id)) return 'That agent is not configured at this practice.'
    if (action === 'settings' && payload.timezone !== p.timezone) return 'Timezone changes require a reviewed schedule migration. Contact the practice administrator.'
    if (action === 'status') {
      const a = p.appointments.find(x => x.id === payload.id)
      if (!a) return 'That appointment is not available at this practice.'
      if (!((a.status === 'Confirmed' && payload.status === 'Arrived') || (a.status === 'Arrived' && payload.status === 'Completed'))) return 'That status change is not available. Use the appointment cancellation action to cancel a visit.'
      let today
      try { today = localDate(now, p.timezone) } catch { return 'The practice timezone needs to be configured.' }
      if (a.date > today.date || (payload.status === 'Completed' && a.date === today.date && minutes(a.time) > today.minutes)) return 'This visit has not happened yet.'
    }
  }
  if (workflow === 'ava' && action === 'register-patient') {
    const norm = (value: string) => value.replace(/[^0-9a-z]/gi, '').toLowerCase()
    if (p.patients.some(x => norm(x.name) === norm(payload.name) && norm(x.phone) === norm(payload.phone))) return 'This patient is already registered with that phone number.'
  }
  return null
}

async function snapshot(call: WorkflowCaller, practiceId: string, now: Date) {
  const result = await call('ava', 'availability', { date: localDate(now).date }, practiceId)
  if (!result.ok) return { error: fail(result.status, result.error) }
  const store = scopeStore(result.body?.store, practiceId)
  if (!store) return { error: fail(502, 'The practice data is incomplete or invalid. No changes were made.') }
  return { store }
}

export async function getDentalStore(access: Access, allowed: readonly string[], call: WorkflowCaller, now = new Date()): Promise<ServiceReply> {
  const blocked = accessError(access, allowed)
  if (blocked) return blocked
  if (access.status !== 'ready') return fail(403, 'Practice access is required.')
  const result = await snapshot(call, access.practiceId, now)
  return result.error ?? { status: 200, body: { store: result.store } }
}

export async function runDentalAction(input: any, access: Access, allowed: readonly string[], call: WorkflowCaller, now = new Date()): Promise<ServiceReply> {
  const blocked = accessError(access, allowed)
  if (blocked) return blocked
  if (access.status !== 'ready') return fail(403, 'Practice access is required.')
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail(400, 'Invalid request.')
  const { workflow, action, practice_id: requestedPracticeId } = input
  if (typeof workflow !== 'string' || typeof action !== 'string') return fail(400, 'Invalid action.')
  const validated = validateDentalAction(workflow, action, input.payload ?? {})
  if (!validated.success) return fail(400, 'This action or its payload is not allowed.')
  if (requestedPracticeId !== access.practiceId) return fail(403, 'You do not have access to that practice.')
  if (!canRunDentalAction(access.role, workflow, action)) return fail(403, 'A practice owner or administrator must approve this change.')
  const payload = validated.data as Record<string, any>
  const before = await snapshot(call, access.practiceId, now)
  if (before.error) return before.error
  const refusal = recordError(before.store!.practices[0], workflow, action, payload, now)
  if (refusal) return fail(409, refusal)
  // n8n's legacy "preview" route commits immediately. The dashboard only calls it
  // after the user's Confirm booking/cancellation button, and never replays its cache.
  const upstreamAction = workflow === 'ava' ? ({ book: 'preview', cancel: 'cancel-preview' } as Record<string, string>)[action] ?? action : action
  const result = await call(workflow, upstreamAction, payload, access.practiceId)
  if (!result.ok) return fail(result.status, result.error)
  const raw = result.body
  if (!raw || typeof raw.success !== 'boolean') return fail(502, 'The operation returned an invalid response. Refresh the schedule before trying again.')
  const body: Record<string, any> = { success: raw.success, message: typeof raw.message === 'string' ? raw.message : 'Operation finished.' }
  const store = raw.store ? scopeStore(raw.store, access.practiceId) : null
  if (store) body.store = store
  if (raw.store && !store) body.refreshRequired = true
  // Proposal tokens, cached envelopes, and arbitrary upstream fields never leave the server.
  const resultFields: Record<string, unknown> = {}
  for (const [key, collection] of [['appointment_id', 'appointments'], ['patient_id', 'patients'], ['conversation_id', 'conversations']] as const) {
    const id = raw.result?.[key]
    if (typeof id === 'string' && store?.practices[0][collection].some(x => x.id === id)) resultFields[key] = id
  }
  body.result = resultFields
  return { status: 200, body }
}
