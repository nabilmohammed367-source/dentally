'use client'

import { useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useDemo } from './demo-provider'
import { Status, ViewHeading } from './shared'
import { DEMO_DATE, WORK_DATE, dayLabel, initials, moveDate, practiceProviders, practiceTreatments, uid, type Appointment } from '@/lib/demo/types'
import { changeStatus, saveAppointment } from '@/lib/demo/operations'
import { liveBook, liveCancel } from '@/lib/live-actions'

function defaultBookingSlot(practice: ReturnType<typeof useDemo>['practice']) {
 let date = WORK_DATE
 const nowParts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: practice.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(part => [part.type, part.value]))
 const localToday = `${nowParts.year}-${nowParts.month}-${nowParts.day}`
 const nowMinutes = Number(nowParts.hour) * 60 + Number(nowParts.minute)
 const opening = Number(practice.opens.slice(0, 2)) * 60 + Number(practice.opens.slice(3, 5))
 const closing = Number(practice.closes.slice(0, 2)) * 60 + Number(practice.closes.slice(3, 5))
 for (let day = 0; day < 30; day++) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
  if (weekday !== 0 && weekday !== 6) {
   for (let start = opening; start + 30 <= closing; start += 30) {
    if (date === localToday && start <= nowMinutes) continue
    const overlaps = practice.appointments.some(a => {
     if (a.date !== date || a.status === 'Cancelled') return false
     const existingStart = Number(a.time.slice(0, 2)) * 60 + Number(a.time.slice(3, 5))
     return start < existingStart + (a.duration || 30) && start + 30 > existingStart
    })
    if (!overlaps) return { date, time: `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}` }
   }
  }
  date = moveDate(date, 1)
 }
 return { date: WORK_DATE, time: practice.opens }
}

export function Appointments({ openAppointment }: { openAppointment: (a: Appointment | 'new') => void }) {
 const { practice } = useDemo()
 const [date, setDate] = useState(WORK_DATE)
 const [mode, setMode] = useState('Day')
 const [provider, setProvider] = useState('All providers')
 const [status, setStatus] = useState('All statuses')
 const days = mode === 'Day' ? [date] : Array.from({ length: 5 }, (_, i) => moveDate(date, i))
 const appointments = practice.appointments.filter(a => days.includes(a.date) && (provider === 'All providers' || a.provider === provider) && (status === 'All statuses' || a.status === status)).sort((a,b) => (a.date + a.time).localeCompare(b.date + b.time))
 return <div className="flex flex-col gap-6"><ViewHeading title="A well-run day starts here." description={`Manage your schedule, with a little help from Ava. All times in ${practice.timezone}.`} action={<Button size="lg" onClick={() => openAppointment('new')}><Plus data-icon="inline-start" />New appointment</Button>} /><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Button variant="outline" size="icon" aria-label="Previous date" onClick={() => setDate(moveDate(date, mode === 'Day' ? -1 : -5))}><ChevronLeft /></Button><Button variant="outline" size="icon" aria-label="Next date" onClick={() => setDate(moveDate(date, mode === 'Day' ? 1 : 5))}><ChevronRight /></Button><Button variant="outline" onClick={() => setDate(WORK_DATE)}>{WORK_DATE === DEMO_DATE ? 'Today' : 'Next working day'}</Button><span className="ml-2 font-medium">{dayLabel(date)}</span></div><div className="flex flex-wrap gap-2"><select aria-label="Calendar view" value={mode} onChange={e => setMode(e.target.value)}><option>Day</option><option>5-day</option></select><select aria-label="Filter provider" value={provider} onChange={e => setProvider(e.target.value)}><option>All providers</option>{practiceProviders(practice).map(p => <option key={p}>{p}</option>)}</select><select aria-label="Filter status" value={status} onChange={e => setStatus(e.target.value)}>{['All statuses', 'Confirmed', 'Arrived', 'Completed', 'Cancelled'].map(s => <option key={s}>{s}</option>)}</select></div></div>
 {mode === '5-day' ? <div className="grid grid-cols-1 gap-3 md:grid-cols-5">{days.map(d => <div key={d} className="min-h-64 rounded-xl border bg-card"><h2 className="border-b p-4 font-medium">{dayLabel(d, true)}</h2><div className="flex flex-col gap-2 p-2">{appointments.filter(a => a.date === d).map(a => <button key={a.id} onClick={() => openAppointment(a)} className="rounded-lg bg-secondary p-3 text-left text-primary"><p className="font-semibold">{a.time}</p><p className="mt-1 text-sm">{practice.patients.find(p => p.id === a.patientId)?.name}</p><p className="mt-1 text-sm">{a.treatment}</p><p className="mt-2 text-sm">{a.status}</p></button>)}</div></div>)}</div> : <div className="overflow-x-auto rounded-xl border bg-card"><table className="data-table"><thead><tr><th>Time</th><th>Patient</th><th>Treatment</th><th>Provider</th><th>Status</th><th>Booked by</th><th><span className="sr-only">Details</span></th></tr></thead><tbody>{appointments.map(a => { const patient = practice.patients.find(p => p.id === a.patientId)!; return <tr key={a.id}><td className="whitespace-nowrap"><p className="font-medium">{a.time}</p><p className="text-muted-foreground">{a.duration} min</p></td><td><div className="flex items-center gap-2"><div className="avatar">{initials(patient.name)}</div><span className="whitespace-nowrap font-medium">{patient.name}</span></div></td><td className="whitespace-nowrap">{a.treatment}</td><td className="whitespace-nowrap"><p>{a.provider}</p><p className="text-muted-foreground">{a.chair}</p></td><td><Status tone={a.status === 'Confirmed' || a.status === 'Completed' ? 'good' : a.status === 'Arrived' ? 'warning' : 'neutral'}>{a.status}</Status></td><td>{a.source}</td><td><Button variant="ghost" aria-label={`Edit ${patient.name} appointment`} onClick={() => openAppointment(a)}>Details</Button></td></tr> })}</tbody></table>{!appointments.length && <div className="empty-state"><CalendarDays className="mb-3 size-7" /><p>No appointments for these filters.</p><Button variant="link" onClick={() => openAppointment('new')}>Book an appointment</Button></div>}</div>}
 <p className="text-sm text-muted-foreground">{appointments.length} appointments shown · {practice.opens}–{practice.closes}, Monday–Friday</p></div>
}
export function AppointmentDialog({ appointment, onClose }: { appointment?: Appointment; onClose: () => void }) {
 const { practice, update, live, run, busy } = useDemo()
 const providers = practiceProviders(practice)
 const treatments = practiceTreatments(practice)
 const [draft, setDraft] = useState<Appointment>(() => { const slot = defaultBookingSlot(practice); return appointment ? { ...appointment } : { id: uid(), patientId: practice.patients[0].id, ...slot, duration: 30, provider: providers[0], chair: 'Chair 1', treatment: treatments[0], status: 'Confirmed', source: 'Staff' } })
 const [confirmCancel, setConfirmCancel] = useState(false)
 const closed = appointment && ['Completed', 'Cancelled'].includes(appointment.status)
 const set = (key: keyof Appointment, value: string | number) => setDraft(d => ({ ...d, [key]: value }))
 async function status(next: Appointment['status']) {
  if (!appointment) return
  if (live) { const ok = next === 'Cancelled' ? await liveCancel(run, appointment.id) : await run('state', 'status', { id: appointment.id, status: next }); if (ok) onClose(); return }
  if (update(p => changeStatus(p, appointment.id, next), `Appointment ${next.toLowerCase()}`)) onClose()
 }
 async function save() {
  if (live) { if (await liveBook(run, { patientId: draft.patientId, treatment: draft.treatment, date: draft.date, time: draft.time, id: appointment?.id })) onClose(); return }
  if (update(p => saveAppointment(p, draft), appointment ? 'Appointment rescheduled' : 'Appointment booked')) onClose()
 }
 return <Dialog open onOpenChange={open => { if (!open) onClose() }}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{appointment ? 'Appointment details' : 'A new appointment'}</DialogTitle><DialogDescription>{practice.name} · Times in {practice.timezone}.</DialogDescription></DialogHeader>
 <form onSubmit={e => { e.preventDefault(); void save() }}><FieldGroup><Field><FieldLabel htmlFor="booking-patient">Patient</FieldLabel><select id="booking-patient" disabled={!!closed} value={draft.patientId} onChange={e => set('patientId', e.target.value)}>{practice.patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><div className="grid grid-cols-2 gap-4"><Field><FieldLabel htmlFor="booking-date">Date</FieldLabel><Input id="booking-date" type="date" required min={DEMO_DATE} value={draft.date} disabled={!!closed} onChange={e => set('date', e.target.value)} /></Field><Field><FieldLabel htmlFor="booking-time">Time</FieldLabel><Input id="booking-time" type="time" required value={draft.time} disabled={!!closed} onChange={e => set('time', e.target.value)} /></Field></div><div className="grid grid-cols-2 gap-4"><Field><FieldLabel htmlFor="booking-treatment">Treatment</FieldLabel><select id="booking-treatment" value={draft.treatment} disabled={!!closed} onChange={e => set('treatment', e.target.value)}>{treatments.map(t => <option key={t}>{t}</option>)}</select></Field><Field><FieldLabel htmlFor="booking-duration">Duration</FieldLabel><select id="booking-duration" value={live ? 30 : draft.duration} disabled={!!closed || live} onChange={e => set('duration', Number(e.target.value))}>{(live ? [30] : [15, 30, 45, 60, 90]).map(n => <option key={n} value={n}>{n} minutes</option>)}</select></Field></div><div className="grid grid-cols-2 gap-4"><Field><FieldLabel htmlFor="booking-provider">Provider</FieldLabel><select id="booking-provider" value={live && !appointment ? 'auto' : draft.provider} disabled={!!closed || live} onChange={e => set('provider', e.target.value)}>{live && !appointment && <option value="auto">First available</option>}{providers.map(p => <option key={p}>{p}</option>)}</select></Field><Field><FieldLabel htmlFor="booking-chair">Chair</FieldLabel><select id="booking-chair" value={live && !appointment ? 'auto' : draft.chair} disabled={!!closed || live} onChange={e => set('chair', e.target.value)}>{live && !appointment && <option value="auto">First available</option>}{['Chair 1', 'Chair 2', 'Chair 3'].map(p => <option key={p}>{p}</option>)}</select></Field></div><p className="text-sm text-muted-foreground">{live ? 'Ava saves this in the DentalOS schedule as a 30-minute slot and picks the first free dentist and chair. It does not sync to your practice-management system.' : 'Provider and chair conflicts are checked before saving.'}</p><div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Close</Button>{!closed && <Button type="submit" disabled={busy}>{busy ? 'Working…' : appointment ? 'Confirm changes' : 'Confirm booking'}</Button>}</div></FieldGroup></form>
 {appointment && !closed && <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">{confirmCancel ? <><p className="text-sm">Cancel this appointment?</p><Button variant="outline" onClick={() => setConfirmCancel(false)}>Keep appointment</Button><Button variant="destructive" onClick={() => status('Cancelled')}>Confirm cancellation</Button></> : <><Button variant="destructive" onClick={() => setConfirmCancel(true)}>Cancel appointment</Button><Button variant="secondary" onClick={() => status(appointment.status === 'Arrived' ? 'Completed' : 'Arrived')}>{appointment.status === 'Arrived' ? 'Mark completed' : 'Mark arrived'}</Button></>}</div>}{closed && <Status>{appointment.status} · Read only</Status>}
 </DialogContent></Dialog>
}
