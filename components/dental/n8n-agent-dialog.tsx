'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useDemo } from './demo-provider'
import { DEMO_DATE, providers, treatments } from '@/lib/demo/types'
import type { Envelope, Workflow } from '@/lib/n8n/engine'

const definitions: Record<string, { workflow: Workflow; actions: [string, string][] }> = {
  reception: { workflow: 'ava', actions: [['availability', 'Find available times'], ['preview', 'Prepare booking'], ['reschedule', 'Prepare reschedule'], ['cancel-preview', 'Prepare cancellation']] },
  support: { workflow: 'milo', actions: [['faq', 'Approved FAQ'], ['booking', 'Request booking with Ava'], ['human', 'Request staff handoff'], ['urgent', 'Urgent concern'], ['optout', 'Opt out of outreach']] },
  reminders: { workflow: 'luna', actions: [['preview', 'Preview recipients'], ['prepare', 'Request staff approval']] },
  waitlist: { workflow: 'finn', actions: [['invite', 'Invite waitlist candidate'], ['accept', 'Simulate patient acceptance'], ['decline', 'Simulate patient decline']] },
  followup: { workflow: 'iris', actions: [['prepare', 'Prepare completed-visit follow-ups'], ['fine', 'Patient says everything is fine'], ['concern', 'Patient asks for help'], ['booking', 'Patient requests another booking']] },
  operations: { workflow: 'leo', actions: [['briefing', 'Generate practice briefing']] },
}
export function WorkflowResult({ response }: { response: Envelope | null }) {
  const { command, pending } = useDemo()
  const [confirmed, setConfirmed] = useState(false)
  if (!response) return null
  const result = response.result
  return <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-4" aria-live="polite"><p className="text-sm font-medium">{response.message}</p>{result.appointment && typeof result.appointment === 'object' ? <p className="text-sm">{Object.entries(result.appointment).filter(([key]) => ['date', 'time', 'treatment', 'provider'].includes(key)).map(([, value]) => String(value)).join(' · ')}</p> : null}{typeof result.token === 'string' && !confirmed && <Button disabled={pending} onClick={async () => { const r = await command({ workflow: 'ava', action: 'confirm', payload: { token: result.token } }); if (r) setConfirmed(true) }}>Confirm {result.cancel ? 'cancellation' : 'booking proposal'}</Button>}{confirmed && <p className="text-sm">Confirmed and persisted in n8n.</p>}{result.metrics && typeof result.metrics === 'object' ? <dl className="grid grid-cols-2 gap-3">{Object.entries(result.metrics).map(([key, value]) => <div key={key}><dt className="text-sm capitalize text-muted-foreground">{key}</dt><dd className="font-semibold">{String(value)}</dd></div>)}</dl> : null}{Array.isArray(result.recipients) && <p className="text-sm">{result.recipients.length} eligible recipients</p>}{typeof result.offer_id === 'string' && <p className="break-all text-sm">Offer ID: {result.offer_id}. Review its approval in Automations before accepting.</p>}<p className="text-sm text-muted-foreground">n8n request: <span className="break-all">{response.request_id}</span></p></div>
}
export function N8nAgentDialog({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const { practice, command, pending, error } = useDemo()
  const d = definitions[agentId]
  const [action, setAction] = useState(d.actions[0][0])
  const [patientId, setPatientId] = useState(practice.patients[3].id)
  const [appointmentId, setAppointmentId] = useState(practice.appointments.find(a => a.status === 'Confirmed')?.id ?? '')
  const [time, setTime] = useState('16:00')
  const [date, setDate] = useState(DEMO_DATE)
  const [kind, setKind] = useState('reminder')
  const [offerId, setOfferId] = useState('')
  const [reply, setReply] = useState<Envelope | null>(null)
  const showPatient = ['reception','support','followup'].includes(agentId)
  const needsBooking = ['preview', 'reschedule', 'booking', 'availability'].includes(action) && agentId !== 'reminders'
  async function run() {
    let a = action; let payload: Record<string, unknown> = { patientId, appointmentId, date, kind, offerId }
    if (needsBooking) { const old = action === 'reschedule' ? practice.appointments.find(a => a.id === appointmentId) : undefined; payload.appointment = old ? { ...old, date, time } : { id: 'new', patientId, date, time, duration: 30, provider: providers[0], chair: 'Chair 1', treatment: treatments[0] }; if (action === 'reschedule') a = 'preview' }
    if (agentId === 'followup' && action !== 'prepare') { a = 'reply'; payload.reply = action === 'fine' ? 'fine' : action === 'booking' ? 'booking' : 'concern' }
    setReply(null); const response = await command({ workflow: d.workflow, action: a, payload }); if (response) setReply(response)
  }
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose() }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{practice.agents.find(a => a.id === agentId)?.name} · n8n workflow</DialogTitle><DialogDescription>Real backend execution, scripted responses, fictional patients. No external messaging.</DialogDescription></DialogHeader><form onSubmit={e => { e.preventDefault(); void run() }}><fieldset disabled={pending}><FieldGroup><Field><FieldLabel htmlFor="remote-action">Action</FieldLabel><select id="remote-action" value={action} onChange={e => { setAction(e.target.value); setReply(null) }}>{d.actions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field>{showPatient && <Field><FieldLabel htmlFor="remote-patient">Fictional patient</FieldLabel><select id="remote-patient" value={patientId} onChange={e => { setPatientId(e.target.value); setReply(null) }}>{practice.patients.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></Field>}{['reschedule','cancel-preview','invite'].includes(action) && <Field><FieldLabel htmlFor="remote-appointment">Appointment</FieldLabel><select id="remote-appointment" value={appointmentId} onChange={e => setAppointmentId(e.target.value)}>{practice.appointments.map(a => <option key={a.id} value={a.id}>{a.date} {a.time} · {a.status} · {practice.patients.find(p => p.id === a.patientId)?.name}</option>)}</select></Field>}{needsBooking && <div className="grid grid-cols-2 gap-3"><Field><FieldLabel htmlFor="remote-date">Date</FieldLabel><Input id="remote-date" type="date" value={date} onChange={e => { setDate(e.target.value); setReply(null) }} /></Field><Field><FieldLabel htmlFor="remote-time">Time</FieldLabel><Input id="remote-time" type="time" value={time} onChange={e => { setTime(e.target.value); setReply(null) }} /></Field></div>}{agentId === 'reminders' && <Field><FieldLabel htmlFor="remote-kind">Outreach</FieldLabel><select id="remote-kind" value={kind} onChange={e => setKind(e.target.value)}><option value="reminder">Appointment reminder</option><option value="recall">Routine recall</option></select></Field>}{['accept','decline'].includes(action) && <Field><FieldLabel htmlFor="offer-id">Offer ID from the invitation result</FieldLabel><Input id="offer-id" required value={offerId} onChange={e => setOfferId(e.target.value)} /></Field>}<Button type="submit">{pending ? 'Running in n8n…' : 'Run workflow'}</Button></FieldGroup></fieldset></form>{error && <p role="alert" className="text-sm">{error}</p>}<WorkflowResult key={reply?.request_id} response={reply} /></DialogContent></Dialog>
}
export function GuidedDemo() {
  const { command, pending, error } = useDemo()
  const [step, setStep] = useState(1)
  const [reply, setReply] = useState<Envelope | null>(null)
  const names = ['Start tour', 'Milo → Ava booking proposal', 'Luna reminder approval', 'Ava cancellation proposal', 'Finn waitlist invitation', 'Iris follow-up approval', 'Staff handoff', 'Leo briefing']
  return <section className="flex flex-col gap-4 rounded-xl border bg-card p-5 text-card-foreground"><div><h2 className="font-semibold">Presenter walkthrough</h2><p className="text-sm leading-6 text-muted-foreground">Eight deliberate steps. Confirm booking proposals here; review outreach in Automations. To fill a waitlist slot, approve its invitation and simulate acceptance with Finn.</p></div><div className="flex flex-wrap gap-3"><select aria-label="Guided demo step" value={step} disabled={pending} onChange={e => setStep(Number(e.target.value))}>{names.map((name, i) => <option key={name} value={i + 1}>{i + 1}. {name}</option>)}</select><Button disabled={pending} onClick={async () => { setReply(null); const r = await command({ workflow: 'guided-demo', action: 'step', payload: { step } }); if (r) { setReply(r); if (typeof r.result.next === 'number') setStep(r.result.next) } }}>{pending ? 'Running…' : 'Run selected step'}</Button></div>{error && <p role="alert" className="text-sm">{error}</p>}<WorkflowResult key={reply?.request_id} response={reply} /></section>
}
