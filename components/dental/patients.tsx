'use client'

import { useState } from 'react'
import { ArrowUpRight, Mail, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { useDemo } from './demo-provider'
import { Status, ViewHeading } from './shared'
import { initials } from '@/lib/demo/types'
import { log } from '@/lib/demo/operations'
import { toast } from 'sonner'

export function Patients() {
 const { practice, update, live, run } = useDemo()
 const [query, setQuery] = useState('')
 const [selected, setSelected] = useState<string | null>(null)
 const [notes, setNotes] = useState('')
 const patient = practice.patients.find(p => p.id === selected)
 const patients = practice.patients.filter(p => `${p.name} ${p.email}`.toLowerCase().includes(query.toLowerCase()))
 function preference(key: 'consent' | 'waitlist' | 'recall', value: boolean) { if (live) { if (key === 'consent') void run('state', 'patient', { id: selected, consent: value }); else toast.info('The waitlist and recall flags are not connected to the live system yet.'); return } update(p => { const patient = p.patients.find(p => p.id === selected)!; patient[key] = value; log(p, 'Patient preference updated', `${patient.name} · ${key}: ${value ? 'Yes' : 'No'}`) }, 'Patient preference updated') }
 return <div className="flex flex-col gap-6"><ViewHeading title="People, not patient numbers." description="A shared picture of every patient, their preferences and their next visit." /><div className="flex flex-wrap items-center justify-between gap-3"><Input className="max-w-sm" placeholder="Search patients…" aria-label="Search patients" value={query} onChange={e => setQuery(e.target.value)} /><p className="text-sm text-muted-foreground">{patients.length} patients · {practice.name}</p></div><div className="overflow-x-auto rounded-xl border bg-card"><table className="data-table"><thead><tr><th>Patient</th><th>Contact</th><th>Communication</th><th>Next steps</th><th><span className="sr-only">Profile</span></th></tr></thead><tbody>{patients.map(p => <tr key={p.id}><td><div className="flex items-center gap-3"><div className="avatar">{initials(p.name)}</div><span className="whitespace-nowrap font-medium">{p.name}</span></div></td><td><p>{p.email}</p><p className="text-muted-foreground">{p.phone}</p></td><td><Status tone={p.consent ? 'good' : 'neutral'}>{p.consent ? 'Opted in' : 'Opted out'}</Status></td><td><span className="text-muted-foreground">{p.waitlist ? 'On waitlist' : p.recall ? 'Recall due' : 'Up to date'}</span></td><td><Button variant="ghost" onClick={() => { setSelected(p.id); setNotes(p.notes) }}>Profile<ArrowUpRight data-icon="inline-end" /></Button></td></tr>)}</tbody></table>{!patients.length && <div className="empty-state">No matching patients.</div>}</div>
 <Dialog open={!!patient} onOpenChange={open => { if (!open) setSelected(null) }}><DialogContent className="sm:max-w-xl">{patient && <><DialogHeader><DialogTitle>{patient.name}</DialogTitle><DialogDescription>Patient profile · {practice.name}</DialogDescription></DialogHeader><div className="flex flex-col gap-2 text-sm text-muted-foreground"><p className="flex items-center"><Mail className="mr-2 size-4" />{patient.email}</p><p className="flex items-center"><Phone className="mr-2 size-4" />{patient.phone}</p></div><FieldGroup><Field orientation="horizontal"><FieldLabel htmlFor="patient-consent">{live ? 'Allow reminders and outreach messages' : 'Allow reminder and outreach simulations'}</FieldLabel><Switch id="patient-consent" checked={patient.consent} onCheckedChange={v => preference('consent', v)} /></Field><Field orientation="horizontal"><FieldLabel htmlFor="patient-waitlist">Interested in earlier appointments</FieldLabel><Switch id="patient-waitlist" disabled={live} checked={patient.waitlist} onCheckedChange={v => preference('waitlist', v)} /></Field><Field orientation="horizontal"><FieldLabel htmlFor="patient-recall">Due for routine recall</FieldLabel><Switch id="patient-recall" disabled={live} checked={patient.recall} onCheckedChange={v => preference('recall', v)} /></Field><Field><FieldLabel htmlFor="patient-notes">Administrative notes</FieldLabel><Textarea id="patient-notes" disabled={live} maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Administrative notes only. No medical details." /></Field></FieldGroup><Button disabled={live} onClick={() => update(p => { const target = p.patients.find(v => v.id === patient.id)!; target.notes = notes.trim(); log(p, 'Administrative note saved', target.name) }, 'Note saved')}>Save notes</Button><div className="border-t pt-4"><h3 className="mb-3 font-medium">Appointment history</h3><div className="flex max-h-48 flex-col gap-3 overflow-y-auto">{practice.appointments.filter(a => a.patientId === patient.id).map(a => <div className="flex items-center justify-between gap-3" key={a.id}><div><p className="text-sm font-medium">{a.treatment}</p><p className="text-sm text-muted-foreground">{a.date} · {a.time}</p></div><Status>{a.status}</Status></div>)}</div></div></>}</DialogContent></Dialog></div>
}
