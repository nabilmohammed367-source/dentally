'use client'

import { useState } from 'react'
import { ArrowRight, Check, Play, Settings2, ShieldCheck, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { useDemo } from './demo-provider'
import { agentIcons, Panel, Status, ViewHeading } from './shared'
import { WORK_DATE as DEMO_DATE, type Agent, type Scenario, type View } from '@/lib/demo/types'
import { log } from '@/lib/demo/operations'
import { scenarios, simulate } from '@/lib/demo/simulator'
import { liveBook, liveCancel, nextWeekday } from '@/lib/live-actions'

const liveAgentDescriptions: Record<string, string> = {
 reception: 'Helps manage bookings in the DentalOS test schedule.',
 support: 'Answers test questions and flags concerns for the team.',
 reminders: 'Prepares reminders and recall messages for review.',
 waitlist: 'Prepares a waitlist offer when a cancelled slot matches.',
 followup: 'Prepares a check-in after an eligible completed visit.',
 operations: 'Builds a daily practice briefing from test records.',
}

export function Agents({ navigate, canManage }: { navigate: (v: View) => void; canManage: boolean }) {
 const { practice, update, live, run } = useDemo()
 const [selected, setSelected] = useState<string | null>(null)
 const [testing, setTesting] = useState<string | null>(null)
 const [faq, setFaq] = useState('')
 const agent = practice.agents.find(a => a.id === selected)
 return <div className="flex flex-col gap-6"><ViewHeading title="Great care takes a great team." description="Six specialists. One shared workspace. Always with your people in control." action={<Status tone="good">{practice.agents.filter(a => a.enabled).length} of 6 enabled</Status>} /><div className="notice flex items-start"><ShieldCheck className="mr-3 mt-0.5 size-5 shrink-0" /><p>{live ? 'Local n8n workflows use test records. Phone, WhatsApp and SMS delivery are not connected. Use synthetic patients only.' : 'These agents are simulated, not live AI. Test a guided scenario to see appointments, conversations and handoffs update together.'}{live && !canManage ? ' Only a practice owner or administrator can pause agents.' : ''}</p></div><div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">{practice.agents.map(a => { const Icon = agentIcons[a.id as keyof typeof agentIcons]; return <Card key={a.id} className="shadow-none"><CardHeader><div className="mb-4 flex items-center justify-between"><div className="icon-tile"><Icon className="size-5" /></div><Switch aria-label={`${a.enabled ? 'Pause' : 'Enable'} ${a.name}`} disabled={!canManage} checked={a.enabled} onCheckedChange={v => live ? void run('state', 'agent', { id: a.id, enabled: v }) : update(p => { p.agents.find(agent => agent.id === a.id)!.enabled = v; log(p, `Agent ${v ? 'enabled' : 'paused'}`, a.name) }, `${a.name} ${v ? 'enabled' : 'paused'}`)} /></div><CardTitle>{a.name} <span className="ml-1 text-sm font-normal text-muted-foreground">/ {a.role}</span></CardTitle><CardDescription>{live ? liveAgentDescriptions[a.id] ?? a.description : a.description}</CardDescription></CardHeader><CardContent><div className="flex items-center justify-between"><Status tone={a.enabled ? 'good' : 'neutral'}>{a.enabled ? (live ? 'On · local test' : 'Enabled') : 'Paused'}</Status><span className="text-sm text-muted-foreground">{a.id === 'operations' ? 'Daily briefing on request' : `${a.handled} ${a.handled === 1 ? 'action' : 'actions'} handled`}</span></div></CardContent><CardFooter className="justify-between"><Button variant="ghost" disabled={live} title={live ? 'FAQ settings are demo-only.' : undefined} onClick={() => { setSelected(a.id); setFaq(a.faq) }}><Settings2 data-icon="inline-start" />Configure</Button><Button variant="outline" disabled={!a.enabled || (live && !['reception', 'support'].includes(a.id))} onClick={() => setTesting(a.id)}><Play data-icon="inline-start" />Test agent</Button></CardFooter></Card> })}</div><Panel title="Recent agent activity" description="Seeded examples and the actions you run in this browser"><div className="flex flex-col gap-4">{practice.activity.slice(0, 8).map(a => <div key={a.id} className="flex items-start gap-3"><div className="activity-dot"><Check className="size-4" /></div><div><p className="font-medium">{a.title}</p><p className="text-sm text-muted-foreground">{a.agent} · {a.detail}</p></div></div>)}</div></Panel>
 <Dialog open={!!agent} onOpenChange={v => { if (!v) setSelected(null) }}><DialogContent className="sm:max-w-lg">{agent && <><DialogHeader><DialogTitle>Configure {agent.name}</DialogTitle><DialogDescription>{agent.role} · Settings for this practice</DialogDescription></DialogHeader><FieldGroup><Field><FieldLabel htmlFor="agent-faq">Approved FAQ response</FieldLabel><Textarea id="agent-faq" rows={5} maxLength={1200} value={faq} disabled={live} onChange={e => setFaq(e.target.value)} /></Field><p className="text-sm text-muted-foreground">{live ? 'FAQ editing is only available in demo mode; these settings are not connected to the live agent.' : 'Used by the FAQ scenario. Keep this administrative; do not include diagnoses, treatment instructions or real patient information.'}</p></FieldGroup>{!live && <Button disabled={!faq.trim()} onClick={() => { if (update(p => { p.agents.find(a => a.id === agent.id)!.faq = faq.trim(); log(p, 'Agent FAQ updated', agent.name) }, 'Approved response saved')) setSelected(null) }}>Save configuration</Button>}</>}</DialogContent></Dialog>
 {testing && <ScenarioDialog agentId={testing} onClose={() => setTesting(null)} onInbox={() => { setTesting(null); navigate('Inbox') }} />}</div>
}
export function ScenarioDialog({ agentId, onClose, onInbox }: { agentId: string; onClose: () => void; onInbox?: () => void }) {
 const { practice, update, live, run, busy } = useDemo()
 const agent = practice.agents.find(a => a.id === agentId)!
 const [reply, setReply] = useState('')
 const bookingDate = live ? nextWeekday(DEMO_DATE) : DEMO_DATE
 // Start with a scenario valid for the selected agent. Otherwise a support
 // dialog can display its first (FAQ) option while retaining Ava's booking
 // action internally, so confirming the visible FAQ could book an appointment.
 const [scenario, setScenario] = useState<Scenario>(!live || agentId === 'reception' ? 'booking' : 'faq')
 const [patient, setPatient] = useState(practice.patients[3].id)
 const [time, setTime] = useState('16:00')
 const [channel, setChannel] = useState<'WhatsApp' | 'Phone' | 'Web'>(agentId === 'reception' ? 'Phone' : 'WhatsApp')
 const [done, setDone] = useState(false)
 const a = practice.appointments.find(a => a.patientId === patient && a.status === 'Confirmed')
 async function runLive() {
  const receptionScenarios: Scenario[] = ['booking', 'reschedule', 'cancellation']
  const supportScenarios: Scenario[] = ['faq', 'optout', 'urgent']
  const allowedScenarios = agentId === 'reception' ? receptionScenarios : supportScenarios
  if (live && !allowedScenarios.includes(scenario)) {
   toast.error('That scenario is not available for this agent. Choose one of the listed scenarios.')
   return
  }
  const prompt = scenarios.find(v => v.id === scenario)!.prompt
  let result = null
  if (scenario === 'booking') result = await liveBook(run, { patientId: patient, treatment: 'Check-up', date: bookingDate, time })
  else if (scenario === 'reschedule' && a) result = await liveBook(run, { patientId: patient, treatment: a.treatment, date: a.date, time, id: a.id })
  else if (scenario === 'cancellation' && a) result = await liveCancel(run, a.id)
  else result = await run('milo', scenario === 'optout' ? 'optout' : scenario === 'urgent' ? 'urgent' : 'faq', { patientId: patient, text: prompt })
  if (result) { setReply(result.message ?? ''); setDone(true) }
 }
 return <Dialog open onOpenChange={v => { if (!v) onClose() }}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Try a little teamwork with {agent.name}</DialogTitle><DialogDescription>{live ? 'Runs against n8n with synthetic patients and may change practice records or create approvals.' : 'Deterministic demo · Nothing is sent outside this browser.'}</DialogDescription></DialogHeader>{done ? <div className="flex flex-col gap-5"><div className="notice"><Check className="mb-3 size-6" />{live ? <>{['booking', 'reschedule', 'cancellation'].includes(scenario) ? 'Ava' : 'Milo'} replied: “{reply}”</> : <>Scenario complete. The conversation, activity feed and any related records have been updated in {practice.name}.</>}</div><Button onClick={onInbox ?? onClose}>View conversation<ArrowRight data-icon="inline-end" /></Button><Button variant="outline" onClick={() => setDone(false)}>Try another scenario</Button></div> : <form onSubmit={e => { e.preventDefault(); if (live) { void runLive(); return } if (update(p => simulate(p, scenario, patient, time, channel, agentId), 'Scenario completed — demo records updated')) setDone(true) }}><FieldGroup><Field><FieldLabel htmlFor="scenario-select">Scenario</FieldLabel><select id="scenario-select" value={scenario} onChange={e => setScenario(e.target.value as Scenario)}>{(live ? scenarios.filter(s => agentId === 'reception' ? ['booking', 'reschedule', 'cancellation'].includes(s.id) : ['faq', 'optout', 'urgent'].includes(s.id)) : scenarios).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field><Field><FieldLabel htmlFor="scenario-patient">Patient</FieldLabel><select id="scenario-patient" value={patient} onChange={e => setPatient(e.target.value)}>{practice.patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>{!live && <Field><FieldLabel htmlFor="scenario-channel">Simulated channel</FieldLabel><select id="scenario-channel" value={channel} onChange={e => setChannel(e.target.value as typeof channel)}><option>WhatsApp</option><option>Phone</option><option>Web</option></select></Field>}{(scenario === 'booking' || scenario === 'reschedule') && <Field><FieldLabel htmlFor="scenario-time">{scenario === 'reschedule' ? 'New time' : 'Booking time'} · {scenario === 'reschedule' && a ? a.date : bookingDate}</FieldLabel><Input type="time" required id="scenario-time" value={time} onChange={e => setTime(e.target.value)} /></Field>}<div className="rounded-lg border bg-background p-3 text-sm leading-6"><p className="font-medium">Before you confirm</p><p className="text-muted-foreground">{scenario === 'booking' ? (live ? `Ask Ava to book a check-up at ${time} on ${bookingDate}. She picks the provider and chair.` : `Book a 30-minute check-up at ${time} on ${DEMO_DATE}, with the first available dentist.`) : scenario === 'reschedule' ? a ? `Move ${a.date}, ${a.time} with ${a.provider} to ${time}.` : 'This patient has no confirmed appointment.' : scenario === 'cancellation' ? a ? `Cancel ${a.treatment} on ${a.date} at ${a.time}.` : 'This patient has no confirmed appointment.' : scenario === 'optout' ? 'Disable reminder and outreach consent for this patient.' : scenario === 'urgent' ? 'Show emergency guidance and create a staff handoff; do not diagnose or contact emergency services.' : (live ? 'Ask Milo this question and show his real answer.' : 'Reply with this agent’s configured administrative FAQ.')}</p></div><Button type="submit" disabled={busy || !agent.enabled || ((scenario === 'cancellation' || scenario === 'reschedule') && !a)}><Play data-icon="inline-start" />{busy ? 'Working…' : live ? 'Confirm & run' : 'Confirm & run simulation'}</Button></FieldGroup></form>}</DialogContent></Dialog>
}
