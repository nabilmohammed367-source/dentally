'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Activity, ArrowUpRight, Bell, Building2, CalendarDays, ChevronDown, CircleHelp, Command, FlaskConical, LayoutDashboard, Menu, MessageSquare, Plus, Search, Settings2, ShieldCheck, Sparkles, Users, Workflow, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Toaster } from '@/components/ui/sonner'
import { DemoProvider, useDemo } from './demo-provider'
import { N8nConnection } from './n8n-connection'
import { Overview } from './overview'
import { Appointments, AppointmentDialog } from './appointments'
import { Agents } from './agents'
import { Inbox } from './inbox'
import { Patients } from './patients'
import { Automations } from './automations'
import { Settings } from './settings'
import type { Appointment, View } from '@/lib/demo/types'
import { cn } from '@/lib/utils'

const navigation = [{ name: 'Overview', icon: LayoutDashboard }, { name: 'Appointments', icon: CalendarDays }, { name: 'Inbox', icon: MessageSquare }, { name: 'Patients', icon: Users }, { name: 'AI agents', icon: Sparkles }, { name: 'Automations', icon: Workflow }] as const
export function DentalApp({ publicDemo = false }: { publicDemo?: boolean }) { return <DemoProvider key={publicDemo ? 'public' : 'presenter'} localOnly={publicDemo}><Workspace publicDemo={publicDemo} /><Toaster theme="light" position="bottom-right" /></DemoProvider> }
function Workspace({ publicDemo }: { publicDemo: boolean }) {
  const { store, practice, switchPractice, ready, revision, connected, pending } = useDemo()
  const [view, setView] = useState<View>('Overview')
  const [mobile, setMobile] = useState(false)
  const [booking, setBooking] = useState<Appointment | 'new' | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [help, setHelp] = useState(false)
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setSearchOpen(open => !open)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])
  useEffect(() => { setBooking(null); setSearchOpen(false) }, [connected, revision])
  const pendingApprovals = ready ? practice.approvals.filter(a => a.status === 'Pending').length : 0
  const attention = ready ? practice.conversations.filter(c => c.status === 'Needs attention').length : 0
  function navigate(v: View) { setView(v); setMobile(false); window.scrollTo({ top: 0, behavior: 'instant' }) }
  function changePractice(id: string) { switchPractice(id); setBooking(null); setQuery(''); setSearchOpen(false) }
  return <div className="flex min-h-dvh">
    {mobile && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-foreground/30 lg:hidden" onClick={() => setMobile(false)} />}
    <aside className={cn('fixed inset-y-0 left-0 z-40 flex w-56 flex-col overflow-y-auto bg-sidebar text-sidebar-foreground transition-transform lg:visible lg:translate-x-0', mobile ? 'visible translate-x-0' : 'invisible -translate-x-full')}>
      <div className="flex h-20 shrink-0 items-center px-6"><div className="mr-2.5 flex size-8 items-center justify-center rounded-xl bg-sidebar-foreground text-sidebar"><Activity className="size-5" strokeWidth={2.6} /></div><span className="text-xl font-semibold tracking-tight">dental<span className="font-normal text-sidebar-foreground/65">os</span><span className="text-primary">.</span></span><button aria-label="Close menu" onClick={() => setMobile(false)} className="ml-auto lg:hidden"><X className="size-5" /></button></div>
      <div className="px-4"><div className="rounded-xl border border-sidebar-border bg-sidebar-accent/40 px-3 py-3"><div className="mb-1 flex items-center text-sidebar-foreground/60"><Building2 className="mr-2 size-4" /><span className="text-sm">Your workspace</span></div><select aria-label="Select practice" value={store.activeId} onChange={e => changePractice(e.target.value)} className="h-8 w-full border-0 bg-transparent px-0 font-medium text-sidebar-foreground [&>option]:bg-sidebar">{store.practices.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div></div>
      <div className="px-4 pt-7"><p className="mb-3 px-3 text-sm text-sidebar-foreground/35">WORKSPACE</p><nav aria-label="Main navigation" className="flex flex-col gap-1">{navigation.map(item => <button key={item.name} className="nav-item" data-active={view === item.name} onClick={() => navigate(item.name)}><item.icon /><span>{item.name}</span>{item.name === 'Inbox' && attention > 0 && <span className="ml-auto rounded-md bg-sidebar-foreground/10 px-1.5 text-sm text-sidebar-foreground">{attention}</span>}{item.name === 'AI agents' && <span className="ml-auto text-sm text-sidebar-foreground/40">6</span>}</button>)}</nav></div>
      <div className="mt-auto px-4 pb-4 pt-8"><div className="mb-5 rounded-xl border border-sidebar-border p-4"><div className="mb-2 flex items-center"><ShieldCheck className="mr-2 size-4 text-sidebar-foreground/80" /><span className="text-sm font-medium">You&apos;re in control</span></div><p className="text-sm leading-6 text-sidebar-foreground/50">Your AI team assists.<br />Your people decide.</p><button onClick={() => navigate('Automations')} className="mt-3 flex items-center text-sm text-sidebar-foreground/80">Review approvals<ArrowUpRight className="ml-2 size-4" /></button></div><button className="nav-item" data-active={view === 'Settings'} onClick={() => navigate('Settings')}><Settings2 />Settings</button><button className="nav-item" onClick={() => setHelp(true)}><CircleHelp />Help & demo guide</button></div>
      <div className="flex items-center border-t border-sidebar-border px-5 py-4"><div className="mr-3 flex size-9 items-center justify-center rounded-full bg-sidebar-accent text-sm">EW</div><div><p className="text-sm font-medium">Emma Wilson</p><p className="text-sm text-sidebar-foreground/45">Demo workspace</p></div></div>
    </aside>
    <div className="flex min-w-0 flex-1 flex-col lg:ml-56">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-secondary px-5 py-2 text-sm text-primary lg:px-8"><Link href="/" className="font-medium underline-offset-4 hover:underline">← Back to Vaqor AI</Link><span>{publicDemo ? 'Public sample · Fictional data only' : 'Presenter workspace · Backend access requires a key'}</span></div>
      <header className="flex h-17 shrink-0 items-center justify-between border-b bg-card px-5 lg:px-8"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setMobile(true)}><Menu /></Button><span className="hidden text-sm text-muted-foreground sm:block">Workspace</span><span className="hidden text-muted-foreground/40 sm:block">/</span><span className="text-sm font-medium">{view}</span></div><div className="flex items-center gap-4"><button disabled={!ready} onClick={() => setSearchOpen(true)} className="hidden items-center text-sm text-muted-foreground sm:flex"><Search className="mr-2 size-4" />Search anything<span className="ml-8 rounded border px-1.5 text-sm">⌘ K</span></button><Button variant="ghost" size="icon" className="sm:hidden" aria-label="Search workspace" disabled={!ready} onClick={() => setSearchOpen(true)}><Search /></Button><Badge variant="secondary"><FlaskConical data-icon="inline-start" />Demo mode</Badge><Button variant="ghost" size="icon" aria-label={`Review ${pendingApprovals} pending approvals`} onClick={() => navigate('Automations')}><Bell /></Button><div className="avatar hidden sm:flex">EW</div></div></header>
      <main className="flex-1 px-5 py-7 lg:px-8"><div className="mx-auto max-w-7xl" key={`${practice.id}-${revision}`}>{!publicDemo && <N8nConnection />}{!ready ? <p role="status" className="py-20 text-center text-muted-foreground">{connected ? 'Waiting for n8n records. Local sample data is hidden in connected mode.' : 'Preparing your demo workspace…'}</p> : <fieldset disabled={pending} className="page-enter min-w-0" key={view}>
        {view === 'Overview' && <Overview navigate={navigate} book={() => setBooking('new')} openAppointment={setBooking} />}
        {view === 'Appointments' && <Appointments openAppointment={setBooking} />}
        {view === 'AI agents' && <Agents navigate={navigate} />}
        {view === 'Inbox' && <Inbox />}
        {view === 'Patients' && <Patients />}
        {view === 'Automations' && <Automations />}
        {view === 'Settings' && <Settings />}
      </fieldset>}</div></main>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3 text-sm text-muted-foreground lg:px-8"><span className="flex items-center"><FlaskConical className="mr-2 size-3.5" />Fictional data. Simulated agents. No real messages.</span><span>{connected ? 'n8n-backed demo' : 'Browser-only demo'} · Do not enter patient information</span></footer>
    </div>
    {booking && <AppointmentDialog key={`${practice.id}-${booking === 'new' ? 'new' : booking.id}`} appointment={booking === 'new' ? undefined : booking} onClose={() => setBooking(null)} />}
    <Dialog open={searchOpen && ready} onOpenChange={setSearchOpen}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Search your workspace</DialogTitle><DialogDescription>Find patients, appointments, or a page in {practice.name}.</DialogDescription></DialogHeader><Input autoFocus aria-label="Search workspace" placeholder="Search a name or page…" value={query} onChange={e => setQuery(e.target.value)} /><div className="flex max-h-80 flex-col gap-1 overflow-y-auto">{navigation.filter(n => n.name.toLowerCase().includes(query.toLowerCase())).map(n => <Button key={n.name} variant="ghost" className="justify-start" onClick={() => { navigate(n.name); setSearchOpen(false) }}><n.icon data-icon="inline-start" />{n.name}</Button>)}{practice.patients.filter(p => p.name.toLowerCase().includes(query.toLowerCase())).map(p => <div key={p.id} className="flex items-center justify-between rounded-lg border p-3"><div><p className="font-medium">{p.name}</p><p className="text-sm text-muted-foreground">Fictional patient</p></div><Button variant="outline" onClick={() => { navigate('Patients'); setSearchOpen(false) }}>Directory</Button></div>)}</div></DialogContent></Dialog>
    <Dialog open={help} onOpenChange={setHelp}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Meet your practice&apos;s new support team</DialogTitle><DialogDescription>A safe, hands-on tour of DentalOS.</DialogDescription></DialogHeader><ol className="list-decimal pl-5 text-sm leading-7"><li>Switch between three fictional practices in the sidebar.</li><li>Open AI agents and test a booking or WhatsApp scenario.</li><li>Check the appointment calendar and inbox for the results.</li><li>Run an automation, preview recipients, then approve or reject.</li><li>Pause agents, update preferences or reset in Settings.</li></ol><p className="notice">{connected ? 'Connected mode stores fictional records in n8n Data Tables behind a presenter access gate. It is not staff authentication or clinical-grade multi-tenancy. No real AI or messaging is active.' : 'No real AI, authentication, messaging, or secure multi-tenancy is active. Data is saved in this browser only.'} The sample day is Monday, 7 September 2026.</p></DialogContent></Dialog>
  </div>
}
