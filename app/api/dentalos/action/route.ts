import { NextResponse } from 'next/server'
import { ALLOWED_PRACTICES, ALLOWED_WORKFLOWS, callN8n } from '@/lib/n8n-server'
import { guardBrowserRequest } from '@/lib/request-guard'
import { DEMO_DATE } from '@/lib/demo/types'
import { getPracticeAccess } from '@/lib/auth'
import { canRunDentalAction, validateDentalAction } from '@/lib/dentalos-api-policy'

export const dynamic = 'force-dynamic'

const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }

// n8n's booking step does not check opening hours or weekends, so the dashboard checks
// before anything reaches Ava. Returns a refusal message, or null if the booking is allowed.
async function checkBooking(payload: Record<string, any>, practiceId: string): Promise<string | null> {
  const a = payload?.appointment
  if (!a || typeof a.date !== 'string' || typeof a.time !== 'string') return 'Ava needs a date and time to book.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(a.time)) return 'That date or time is not valid.'
  const parsedDate = new Date(`${a.date}T12:00:00Z`)
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== a.date) return 'That date or time is not valid.'
  const day = new Date(a.date + 'T12:00:00Z').getUTCDay()
  if (day === 0 || day === 6) return 'The practice is closed at weekends. Please choose a weekday.'
  const snap = await callN8n('ava', 'availability', { date: a.date }, practiceId)
  const practice = snap.ok ? snap.body?.store?.practices?.find((p: any) => p.id === practiceId) : null
  if (!practice) return 'Could not check the schedule right now. Please try again in a moment.'
  // "Now" in the assigned practice's timezone (appointment times are wall-clock values).
  const timezone = typeof practice.timezone === 'string' ? practice.timezone : 'Europe/Amsterdam'
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()).map(x => [x.type, x.value]))
  const today = `${parts.year}-${parts.month}-${parts.day}`
  const nowMinutes = (Number(parts.hour) % 24) * 60 + Number(parts.minute)
  if (a.date < today || (a.date === today && toMinutes(a.time) <= nowMinutes)) return 'That time has already passed. Please choose a future time.'
  let opens = '09:00', closes = '17:00'
  if (practice?.opens && practice?.closes) { opens = practice.opens; closes = practice.closes }
  const duration = 30
  if (toMinutes(a.time) < toMinutes(opens) || toMinutes(a.time) + duration > toMinutes(closes)) return `The practice is open ${opens}–${closes}. Please choose a time inside those hours.`
  if (!practice.patients?.some((p: any) => p.id === a.patientId)) return 'That patient is not registered at this practice.'
  const start = toMinutes(a.time)
  const clash = practice.appointments?.find((x: any) => {
    if (x.patientId !== a.patientId || x.date !== a.date || x.status === 'Cancelled' || x.id === a.id) return false
    const existingStart = toMinutes(x.time)
    return start < existingStart + (Number(x.duration) || 30) && start + duration > existingStart
  })
  if (clash) return 'This patient already has an appointment at that time.'
  if (a.id) {
    const existing = practice.appointments?.find((x: any) => x.id === a.id)
    if (!existing) return 'That appointment no longer exists.'
    if (existing.patientId !== a.patientId) return 'That appointment belongs to a different patient.'
    if (existing.status === 'Cancelled' || existing.status === 'Completed') return `That appointment is already ${existing.status.toLowerCase()}, so it cannot be moved.`
  }
  return null
}

export async function POST(request: Request) {
  const blocked = guardBrowserRequest(request, true)
  if (blocked) return blocked
  const access = await getPracticeAccess()
  if (access.status === 'signed_out') return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 })
  if (access.status === 'unassigned') return NextResponse.json({ error: 'Your account has not been assigned to a practice.' }, { status: 403 })
  if (access.status !== 'ready') return NextResponse.json({ error: 'Authentication or practice access is not configured.' }, { status: 503 })
  const input = await request.json().catch(() => null)
  const workflow = input?.workflow
  const action = input?.action
  const rawPayload = input?.payload ?? {}
  const requestedPracticeId = input?.practice_id
  if (!ALLOWED_WORKFLOWS.includes(workflow)) return NextResponse.json({ error: 'Unknown agent.' }, { status: 400 })
  if (typeof action !== 'string' || !/^[a-z_-]{2,40}$/.test(action)) return NextResponse.json({ error: 'Invalid action.' }, { status: 400 })
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 })
  const validated = validateDentalAction(workflow, action, rawPayload)
  if (!validated.success) return NextResponse.json({ error: 'This action or its payload is not allowed.' }, { status: 400 })
  const payload = validated.data as Record<string, any>
  if (requestedPracticeId !== access.practiceId) return NextResponse.json({ error: 'You do not have access to that practice.' }, { status: 403 })
  if (!ALLOWED_PRACTICES.includes(access.practiceId)) return NextResponse.json({ error: 'The assigned practice is not configured in DentalOS.' }, { status: 403 })
  // Enforce practice roles on the server, not just in the UI.
  if (!canRunDentalAction(access.role, workflow, action)) {
    return NextResponse.json({ error: 'A practice owner or administrator must approve this change.' }, { status: 403 })
  }
  const practiceId = access.practiceId
  if (workflow === 'ava' && action === 'preview') {
    const refusal = await checkBooking(payload, practiceId)
    if (refusal) return NextResponse.json({ success: false, message: refusal })
  }
  if (workflow === 'ava' && action === 'cancel-preview') {
    const snap = await callN8n('ava', 'availability', { date: DEMO_DATE }, practiceId)
    const appt = snap.ok ? snap.body?.store?.practices?.find((p: any) => p.id === practiceId)?.appointments?.find((x: any) => x.id === payload.appointmentId) : null
    if (!appt) return NextResponse.json({ success: false, message: 'That appointment could not be found.' })
    if (appt.status === 'Cancelled') return NextResponse.json({ success: false, message: 'That appointment is already cancelled.' })
    if (appt.status === 'Completed') return NextResponse.json({ success: false, message: 'That appointment has already taken place.' })
  }
  if (workflow === 'ava' && action === 'register-patient') {
    // Same name AND same phone = the same person registering twice. Same name alone can be two people.
    const norm = (v: unknown) => String(v ?? '').replace(/[^0-9a-z]/gi, '').toLowerCase()
    const snap = await callN8n('ava', 'availability', { date: DEMO_DATE }, practiceId)
    if (!snap.ok) return NextResponse.json({ success: false, message: 'Could not verify the patient list right now. Please try again.' }, { status: 503 })
    const practice = snap.body?.store?.practices?.find((p: any) => p.id === practiceId)
    if (!practice || !Array.isArray(practice.patients)) return NextResponse.json({ success: false, message: 'Could not verify this practice right now. Please try again.' }, { status: 503 })
    const patients = practice.patients
    const same = patients.find((x: any) => norm(x.name) === norm(payload.name) && norm(x.phone) && norm(x.phone) === norm(payload.phone))
    if (same) return NextResponse.json({ success: false, message: `${same.name} is already registered with that phone number.` })
  }
  const result = await callN8n(workflow, action, payload, practiceId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  const responseBody = result.body && typeof result.body === 'object' ? { ...result.body } : result.body
  if (responseBody?.store?.practices) {
    const practices = responseBody.store.practices
    if (!Array.isArray(practices)) return NextResponse.json({ error: 'n8n returned an invalid practice snapshot.' }, { status: 502 })
    const practice = practices.find((item: any) => item?.id === practiceId)
    if (!practice) return NextResponse.json({ error: 'The assigned practice is not available in DentalOS.' }, { status: 502 })
    responseBody.store = { ...responseBody.store, activeId: practiceId, practices: [practice] }
  }
  return NextResponse.json(responseBody, { headers: { 'Cache-Control': 'private, no-store' } })
}
