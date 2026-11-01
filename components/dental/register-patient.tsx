'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { uid } from '@/lib/demo/types'
import { useDemo } from './demo-provider'

export function RegisterPatientDialog({ onClose }: { onClose: () => void }) {
  const { live, run, update, busy } = useDemo()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  async function save() {
    if (busy || name.trim().length < 2 || phone.trim().length < 5) return
    if (live) {
      if (await run('ava', 'register-patient', { name: name.trim(), phone: phone.trim() })) onClose()
      return
    }
    if (update(p => {
      if (p.patients.some(x => x.name.toLowerCase() === name.trim().toLowerCase() && x.phone === phone.trim())) throw new Error('This patient is already registered.')
      p.patients.push({ id: uid(), name: name.trim(), phone: phone.trim(), email: '', notes: '', consent: false, recall: false, waitlist: false })
    }, 'Patient registered')) onClose()
  }
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}><DialogContent className="sm:max-w-md">
    <DialogHeader><DialogTitle>Add a patient</DialogTitle><DialogDescription>Register a patient before booking their first appointment.</DialogDescription></DialogHeader>
    <form onSubmit={e => { e.preventDefault(); void save() }}><FieldGroup>
      <Field><FieldLabel htmlFor="new-patient-name">Full name</FieldLabel><Input id="new-patient-name" autoComplete="off" required minLength={2} maxLength={160} value={name} onChange={e => setName(e.target.value)} disabled={busy} /></Field>
      <Field><FieldLabel htmlFor="new-patient-phone">Phone number</FieldLabel><Input id="new-patient-phone" type="tel" autoComplete="off" required minLength={5} maxLength={40} value={phone} onChange={e => setPhone(e.target.value)} disabled={busy} /></Field>
      <p className="text-sm text-muted-foreground">Reminders and outreach start disabled. Enable them in the patient profile only after recording the patient&apos;s permission.</p>
      {live && <p className="notice">This workspace is still for synthetic test patients. Do not enter real patient information.</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Close</Button><Button type="submit" disabled={busy || name.trim().length < 2 || phone.trim().length < 5}>{busy ? 'Saving…' : 'Register patient'}</Button></div>
    </FieldGroup></form>
  </DialogContent></Dialog>
}
