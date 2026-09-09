import { Activity, CalendarDays, LayoutDashboard, MessageSquare, Sparkles, Users, Check, ArrowUpRight } from 'lucide-react'
import { createStore } from '@/lib/demo/seed'
import Link from 'next/link'

export function DashboardPreview() {
  const practice = createStore().practices[0]
  return <div className="vaqor-dashboard" aria-label="Illustrative DentalOS dashboard with fictional sample data">
    <div className="vaqor-window-bar"><span className="flex items-center gap-1.5" aria-hidden="true"><i /><i /><i /></span><span>DentalOS · Interactive sample</span><span className="vaqor-preview-label">DEMO</span></div>
    <div className="flex min-w-0">
      <aside className="vaqor-preview-sidebar"><div className="flex items-center gap-2 text-lg font-semibold"><Activity className="size-5" />dentalos.</div><div className="vaqor-preview-practice">{practice.name}<span>Sample workspace</span></div><div className="flex flex-col gap-2">{[{ icon: LayoutDashboard, name: 'Overview' }, { icon: CalendarDays, name: 'Appointments' }, { icon: MessageSquare, name: 'Inbox' }, { icon: Users, name: 'Patients' }, { icon: Sparkles, name: 'AI agents' }].map((item, index) => <div key={item.name} className={index === 0 ? 'vaqor-preview-active' : ''}><item.icon className="size-4 shrink-0" />{item.name}</div>)}</div><p className="mt-auto text-sm opacity-60">Your team. In control.</p></aside>
      <div className="vaqor-preview-content"><div className="flex items-start justify-between gap-4"><div><p className="vaqor-preview-label">MONDAY, 7 SEPTEMBER</p><h3 className="mt-2 text-xl font-medium tracking-tight sm:text-2xl">A little less admin.<br />A lot more care.</h3></div><span className="vaqor-mini-status"><Check className="size-4" />Sample workspace</span></div>
        <div className="vaqor-preview-stats">{[{ label: 'Appointments', value: practice.appointments.length }, { label: 'Support agents', value: practice.agents.length }, { label: 'To review', value: practice.approvals.length }].map(stat => <div key={stat.label}><span>{stat.label}</span><strong>{stat.value}</strong></div>)}</div>
        <div className="vaqor-preview-schedule"><div className="flex items-center justify-between gap-3"><h4 className="font-medium">Today at {practice.name}</h4><CalendarDays className="size-4" /></div>{practice.appointments.slice(2, 5).map(appointment => <div key={appointment.id} className="vaqor-preview-row"><span>{appointment.time}</span><span><strong>{practice.patients.find(p => p.id === appointment.patientId)?.name}</strong><small>{appointment.treatment}</small></span><span className="vaqor-mini-status">{appointment.status}</span></div>)}</div>
        <Link href="/demo" className="vaqor-preview-link">This is just a preview. Try it for yourself <ArrowUpRight className="size-4" /></Link>
      </div>
    </div>
  </div>
}
