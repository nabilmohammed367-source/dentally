'use client'

import { useState } from 'react'
import { CheckCheck, MessageSquare, Play, Send, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldLabel } from '@/components/ui/field'
import { Message, MessageContent, MessageHeader } from '@/components/ui/message'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { MessageScrollerProvider, MessageScroller, MessageScrollerViewport, MessageScrollerContent, MessageScrollerItem, MessageScrollerButton } from '@/components/ui/message-scroller'
import { useDemo } from './demo-provider'
import { ChannelIcon, Status, ViewHeading } from './shared'
import { ScenarioDialog } from './agents'
import { initials, uid, type Conversation } from '@/lib/demo/types'
import { log } from '@/lib/demo/operations'
import { cn } from '@/lib/utils'

// Milo handles five situations. Sort the message into one so it reaches the real Milo,
// instead of n8n's scripted fallback. Urgent wording is checked first, for safety.
function miloAction(text: string) {
 const t = text.toLowerCase()
 if (/breath|swelling|bleeding|emergency|severe|urgent/.test(t)) return 'urgent'
 if (/\b(stop|unsubscribe|opt.?out|no more (messages|reminders))\b/.test(t)) return 'optout'
 if (/\b(human|person|someone|staff|team member|receptionist|call me|speak to)\b/.test(t)) return 'human'
 // Milo's own booking step books a fixed placeholder slot, so booking requests go to staff instead.
 if (/\b(book|appointment|schedule|reschedule|slot|available|availability)\b/.test(t)) return 'human'
 if (/\b(open|opening|hours|close|closing|when are you|what time)\b/.test(t)) return 'faq'
 return 'message'
}
export function Inbox() {
 const { practice, update, live, run, busy } = useDemo()
 const [selected, setSelected] = useState(practice.conversations[0]?.id ?? '')
 const [query, setQuery] = useState('')
 const [channel, setChannel] = useState('All channels')
 const [status, setStatus] = useState('All statuses')
 const [testing, setTesting] = useState(false)
 const [reply, setReply] = useState('')
 const conversations = practice.conversations.filter(c => (channel === 'All channels' || c.channel === channel) && (status === 'All statuses' || c.status === status) && `${practice.patients.find(p => p.id === c.patientId)?.name} ${c.messages.map(m => m.text).join(' ')}`.toLowerCase().includes(query.toLowerCase()))
 const conversation = practice.conversations.find(c => c.id === selected)
 const patient = practice.patients.find(p => p.id === conversation?.patientId)
 function patch(recipe: (c: Conversation) => void, label: string) { update(p => { const c = p.conversations.find(c => c.id === selected); if (!c) throw new Error('Conversation not found.'); recipe(c); if (c.status === 'Needs attention' && !p.approvals.some(a => a.conversationId === c.id && a.status === 'Pending')) p.approvals.unshift({ id: uid(), kind: 'urgent', title: 'Patient concern — staff review required', description: `${patient?.name ?? 'Patient'}: review this flagged conversation before replying. No diagnosis is provided.`, patientIds: [c.patientId], agentId: 'support', conversationId: c.id, status: 'Pending' }); log(p, label, patient?.name ?? '') }, label) }
 async function send() {
  if (busy || !reply.trim() || !conversation || conversation.status === 'Resolved') return
  if (conversation.status !== 'Staff handling' && !practice.agents.find(a => a.id === 'support')?.enabled) { update(() => { throw new Error('Milo is paused. Take over the conversation or enable the agent.') }); return }
  const text = reply.trim()
  if (live) { const saved = await (conversation.status === 'Staff handling' ? run('state', 'conversation', { id: conversation.id, status: 'Staff handling', text }) : run('milo', miloAction(text), { patientId: conversation.patientId, conversationId: conversation.id, text })); if (saved) setReply(''); return }
  patch(c => {
    const staff = c.status === 'Staff handling'
    c.messages.push({ id: uid(), role: staff ? 'staff' : 'patient', text })
    if (!staff) {
      const urgent = /breath|swelling|bleeding|emergency|severe/.test(text.toLowerCase())
      const clinical = urgent || /pain|treatment|diagnos|medicin|prescri/.test(text.toLowerCase())
      if (clinical) { c.status = 'Needs attention'; c.assigned = 'Unassigned' }
      c.messages.push({ id: uid(), role: 'agent', text: clinical ? (urgent ? 'This may require urgent care. Contact your local urgent or emergency services, particularly for breathing difficulty. Do not wait for this demo. ' : '') + 'A clinician needs to review this concern. I have marked this conversation for staff; no diagnosis is provided.' : 'This is a guided simulation, not a live language model. Use “Test a scenario” for booking, rescheduling, cancellation, FAQ, reminder opt-out or urgent escalation.' })
    }
  }, 'Demo reply added')
  setReply('')
 }
 return <div className="flex flex-col gap-6"><ViewHeading title="Every conversation. One place." description="Stay close to your patients, from the first hello to the next appointment." action={<Button onClick={() => setTesting(true)}><Play data-icon="inline-start" />Test a scenario</Button>} /><div className="flex flex-wrap items-center gap-3"><Input placeholder="Search conversations…" aria-label="Search conversations" className="max-w-xs" value={query} onChange={e => setQuery(e.target.value)} /><select aria-label="Filter inbox channel" value={channel} onChange={e => setChannel(e.target.value)}>{['All channels', 'WhatsApp', 'Phone', 'Web'].map(c => <option key={c}>{c}</option>)}</select><select aria-label="Filter conversation status" value={status} onChange={e => setStatus(e.target.value)}>{['All statuses', 'Agent handling', 'Needs attention', 'Staff handling', 'Resolved'].map(c => <option key={c}>{c}</option>)}</select></div>
 <div className="flex min-h-[580px] flex-col overflow-hidden rounded-xl border bg-card md:h-[620px] md:flex-row"><div className="flex max-h-72 shrink-0 flex-col overflow-y-auto border-b md:max-h-none md:w-64 md:border-r md:border-b-0"><div className="border-b px-4 py-3 font-medium">Conversations <span className="ml-1 text-muted-foreground">{conversations.length}</span></div>{conversations.map(c => { const p = practice.patients.find(p => p.id === c.patientId)!; return <button key={c.id} onClick={() => { setSelected(c.id); setReply('') }} className={cn('border-b p-4 text-left transition-colors hover:bg-muted/50', c.id === selected && 'bg-secondary/60')}><div className="flex items-center justify-between"><div className="flex items-center gap-2"><div className="avatar">{initials(p.name)}</div><p className="text-sm font-medium">{p.name}</p></div><ChannelIcon channel={c.channel} /></div><p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">{c.messages.at(-1)?.text}</p><div className="mt-3"><Status tone={c.status === 'Needs attention' ? 'warning' : c.status === 'Resolved' ? 'good' : 'neutral'}>{c.status}</Status></div></button> })}{!conversations.length && <div className="empty-state">No conversations match.</div>}</div>
 {conversation && patient ? <section className="flex min-h-[580px] min-w-0 flex-1 flex-col md:min-h-0"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">{patient.name}</h2><p className="text-sm text-muted-foreground">{conversation.channel} · {conversation.assigned} · {live ? 'Live' : 'Simulated'}</p></div><div className="flex gap-2"><Button variant="outline" disabled={busy || conversation.status === 'Staff handling' || conversation.status === 'Resolved'} onClick={() => live ? void run('state', 'conversation', { id: conversation.id, status: 'Staff handling', text: 'A staff member has taken over this conversation.' }) : patch(c => { c.status = 'Staff handling'; c.assigned = 'Practice team'; c.messages.push({ id: uid(), role: 'system', text: 'A staff member took over this conversation.' }) }, 'Conversation assigned to Emma')}><UserRound data-icon="inline-start" />Take over</Button><Button variant="secondary" disabled={busy || conversation.status === 'Resolved'} onClick={() => live ? void run('state', 'conversation', { id: conversation.id, status: 'Resolved', text: conversation.messages.filter(m => m.role !== 'system').at(-1)?.text ?? 'Resolved by staff.' }) : patch(c => { c.status = 'Resolved' }, 'Conversation resolved')}><CheckCheck data-icon="inline-start" />Resolve</Button></div></div>
 <div className="border-b bg-background px-4 py-2 text-sm text-muted-foreground">{patient.consent ? 'Reminders permitted' : 'Reminders opted out'} · {practice.appointments.filter(a => a.patientId === patient.id && a.status === 'Confirmed').length} confirmed appointment(s)</div>
 <div className="min-h-0 flex-1" key={conversation.id}><MessageScrollerProvider><MessageScroller><MessageScrollerViewport><MessageScrollerContent className="p-5">{conversation.messages.map(m => <MessageScrollerItem key={m.id}>{m.role === 'system' ? <p className="text-center text-sm leading-6 text-muted-foreground">{m.text}</p> : <Message align={m.role === 'patient' ? 'start' : 'end'}><MessageContent><MessageHeader>{m.role === 'patient' ? patient.name : m.role === 'staff' ? 'Practice team · Staff' : live ? 'Milo · Live' : 'Agent · Simulated'}</MessageHeader><Bubble variant={m.role === 'patient' ? 'muted' : 'secondary'} align={m.role === 'patient' ? 'start' : 'end'}><BubbleContent>{m.text}</BubbleContent></Bubble></MessageContent></Message>}</MessageScrollerItem>)}</MessageScrollerContent></MessageScrollerViewport><MessageScrollerButton /></MessageScroller></MessageScrollerProvider></div>
 {live && <p className="notice mx-4 mt-3">Test messages and staff notes are saved in the conversation history. No WhatsApp or SMS message is delivered. Older conversations may contain only a summary.</p>}
 <form className="border-t p-4" onSubmit={e => { e.preventDefault(); send() }}><Field><FieldLabel htmlFor="inbox-reply">{conversation.status === 'Staff handling' ? 'Staff reply · not delivered' : live ? 'Run a live test message as the patient' : 'Simulate a patient message'}</FieldLabel><Textarea id="inbox-reply" maxLength={1500} disabled={busy || conversation.status === 'Resolved'} placeholder={conversation.status === 'Resolved' ? 'This conversation has been resolved.' : 'Fictional messages only…'} value={reply} onChange={e => setReply(e.target.value)} onKeyDown={e => { if (e.nativeEvent.isComposing || e.keyCode === 229) return; if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} /></Field><div className="mt-3 flex items-center justify-between"><p className="text-sm text-muted-foreground">{live ? 'Sends the test input to n8n and may change practice records. Use synthetic patients only.' : 'No message leaves this browser.'}</p><Button type="submit" disabled={busy || !reply.trim() || conversation.status === 'Resolved'}><Send data-icon="inline-start" />{live ? 'Run test' : 'Add reply'}</Button></div></form>
 </section> : <div className="empty-state flex-1"><MessageSquare className="mb-3 size-8" />Select a conversation.</div>}</div>
 {testing && <ScenarioDialog agentId="support" onClose={() => setTesting(false)} onInbox={() => { setTesting(false); setSelected(practice.conversations[0]?.id ?? '') }} />}</div>
}
