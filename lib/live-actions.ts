'use client'

import { toast } from 'sonner'
import type { Practice } from './demo/types'

// Envelope returned by every DentalOS n8n connection.
export type Envelope = { success: boolean; message?: string; result?: Record<string, any>; store?: unknown }
export type Run = (workflow: string, action: string, payload: Record<string, unknown>, options?: { quiet?: boolean; conversationId?: string }) => Promise<Envelope | null>

export function nextWeekday(date: string) {
  const d = new Date(date + 'T12:00:00Z')
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

// Book (or reschedule, when id is given) through the real Ava: preview, then confirm.
export async function liveBook(run: Run, a: { patientId: string; treatment: string; date: string; time: string; id?: string }) {
  const appointment: Record<string, string> = { patientId: a.patientId, treatment: a.treatment, date: a.date, time: a.time }
  if (a.id) appointment.id = a.id
  const preview = await run('ava', 'preview', { appointment }, { quiet: true })
  if (!preview) return null
  const token = preview.result?.token
  if (!token) { toast.error(preview.message || 'Ava could not prepare that booking.'); return null }
  return run('ava', 'confirm', { token })
}

// Cancel through the real Ava, which also releases the slot to Finn's waitlist.
export async function liveCancel(run: Run, appointmentId: string) {
  const preview = await run('ava', 'cancel-preview', { appointmentId }, { quiet: true })
  if (!preview) return null
  const token = preview.result?.token
  if (!token) { toast.error(preview.message || 'Ava could not cancel that appointment.'); return null }
  return run('ava', 'confirm', { token })
}

// Run one of the automation recipes with its real agent.
export async function liveRecipe(run: Run, practice: Practice, kind: string) {
  if (kind === 'reminder' || kind === 'recall') return run('luna', 'preview', { kind })
  if (kind === 'summary') return run('leo', 'briefing', {})
  if (kind === 'followup') return run('iris', 'prepare', {})
  if (kind === 'waitlist') {
    const cancelled = practice.appointments.filter(a => a.status === 'Cancelled').sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))[0]
    if (!cancelled) { toast.info('There is no cancelled appointment to offer to the waitlist yet. Cancel one first.'); return null }
    return run('finn', 'invite', { appointmentId: cancelled.id })
  }
  toast.info('This automation is not connected to a live agent yet.')
  return null
}
