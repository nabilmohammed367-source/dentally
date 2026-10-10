'use client'

import { motion } from 'framer-motion'
import { ArrowRight, BatteryFull, Bell, CalendarDays, Check, CheckCheck, ClipboardList, Clock3, Headphones, HeartHandshake, MessageCircle, MousePointer2, Phone, PhoneMissed, ShieldCheck, Stethoscope, UserRound } from 'lucide-react'

const agents = [
  { name: 'Ava', role: 'Receptionist', icon: Phone },
  { name: 'Milo', role: 'Patient support', icon: MessageCircle },
  { name: 'Luna', role: 'Reminders & recall', icon: Bell },
  { name: 'Finn', role: 'Waitlist', icon: CalendarDays },
  { name: 'Iris', role: 'Follow-up', icon: HeartHandshake },
  { name: 'Leo', role: 'Daily briefing', icon: ClipboardList },
]

export function SceneHeading({ eyebrow, children, description }: { eyebrow: string; children: React.ReactNode; description: string }) {
  return <div className="film-copy"><p className="film-eyebrow">{eyebrow}</p><h1>{children}</h1><p className="film-description">{description}</p></div>
}

export function PhoneScene({ time }: { time: number }) {
  const count = Math.min(3, 1 + Math.floor(time / 1200))
  return <div className="film-split"><SceneHeading eyebrow="THE EVERYDAY CHALLENGE" description="A busy front desk. A full waiting room. And another call to answer.">Your phone never<br />stops ringing.</SceneHeading><div className="film-visual"><div className="film-phone incoming"><div className="film-phone-top"><span>09:41</span><BatteryFull size={20} aria-label="Battery full" /></div><div className="film-caller"><div className="film-avatar"><UserRound /></div><span>Inkomende oproep</span><strong>Patiënt</strong><span>Mobiel</span></div><motion.div className="film-ring" animate={{ scale: [1, 1.07, 1] }} transition={{ duration: 1.3, repeat: Infinity }}><Phone /></motion.div><div className="film-home-indicator" /></div><motion.div className="film-floating-call" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .35 }}><div className="film-icon-box"><PhoneMissed /></div><div><span>Gemiste oproepen</span><strong key={count}>{count} <small>gemiste oproepen</small></strong></div></motion.div></div></div>
}

export function TeamScene() {
  return <div className="film-centered"><SceneHeading eyebrow="A LITTLE HELP. A BIG DIFFERENCE." description="Six assistants. One calmer working day.">Meet your new<br /><em>practice team.</em></SceneHeading><div className="film-agents">{agents.map(({ name, role, icon: Icon }, index) => <motion.div className="film-agent" key={name} initial={{ opacity: 0, y: 26, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: .25 + index * .32, duration: .55 }}><div className="film-agent-avatar"><Icon /></div><strong>{name}</strong><span>{role}</span><div className="film-agent-ready"><i /> Here to help</div></motion.div>)}</div></div>
}

export function ChatScene({ time }: { time: number }) {
  return <div className="film-split"><SceneHeading eyebrow="MILO / PATIENT SUPPORT" description="Everyday questions, answered clearly. In your patients’ own language.">A familiar question.<br /><em>A helpful answer.</em></SceneHeading><div className="film-visual"><div className="film-phone chat-phone"><div className="film-phone-top"><span>09:41</span><BatteryFull size={20} aria-label="Battery full" /></div><div className="film-chat-header"><div className="film-small-avatar"><MessageCircle /></div><div><strong>Milo</strong><span>DentalOS · Patiëntondersteuning</span></div><Phone size={22} /></div><div className="film-chat-body" lang="nl"><span className="film-chat-day">Vandaag</span><motion.div className="film-message patient" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .35 }}>Hoe laat zijn jullie open?<small>09:41 <CheckCheck size={16} /></small></motion.div>{time < 1500 ? <div className="film-typing" aria-label="Milo is typing">•••</div> : <motion.div className="film-message assistant" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}><strong>Milo</strong>Wij zijn open van maandag tot en met vrijdag, van 9:00 tot 17:00 uur.<small>09:41</small></motion.div>}</div><div className="film-chat-input"><span>Bericht</span><MessageCircle size={20} /></div><div className="film-home-indicator" /></div></div></div>
}

export function CalendarScene({ time }: { time: number }) {
  const booked = time >= 1700
  return <div className="film-split"><SceneHeading eyebrow="FINN / WAITLIST" description="A change of plans becomes a new opportunity. With your team in control.">Cancelled appointment?<br /><em>Filled from<br />the waitlist.</em></SceneHeading><div className="film-calendar film-surface"><div className="film-surface-header"><div><span>AGENDA</span><h2>Vandaag</h2></div><CalendarDays /></div><div className="film-calendar-columns"><span>Tijd</span><span>Behandelkamer</span></div><div className="film-calendar-row"><time>10:00</time><div className="film-calendar-muted">Controle <span>30 min</span></div></div><div className="film-calendar-row"><time>10:30</time><motion.div className={`film-calendar-slot ${booked ? 'booked' : ''}`} animate={{ scale: booked ? [1, 1.025, 1] : 1 }}><div className="film-slot-icon">{booked ? <Check /> : <Clock3 />}</div><div><strong>{booked ? 'Afspraak bevestigd' : 'Afspraak geannuleerd'}</strong><span>{booked ? 'Ingepland vanuit de wachtlijst' : 'Een plek is vrijgekomen'}</span></div></motion.div></div><div className="film-calendar-row"><time>11:00</time><div className="film-calendar-muted">Controle <span>30 min</span></div></div><div className="film-calendar-footer"><div className="film-small-avatar"><CalendarDays /></div><div><strong>Finn · Waitlist assistant</strong><span>{booked ? 'Ingepland vanuit de wachtlijst' : 'Preparing a match for review…'}</span></div>{booked && <CheckCheck />}</div></div></div>
}

export function ApprovalScene({ time }: { time: number }) {
  const approved = time >= 2300
  return <div className="film-split"><SceneHeading eyebrow="YOUR PRACTICE. YOUR CONTROL." description="Review the draft. Make it yours. You always have the final say.">Nothing goes out<br />without <em>your<br />approval.</em></SceneHeading><div className="film-approval film-surface"><div className="film-surface-header"><div><span>IRIS / FOLLOW-UP</span><h2>Klaar voor controle</h2></div><ShieldCheck /></div><div className="film-draft" lang="nl"><span>CONCEPTBERICHT</span><p>Beste Sanne,</p><p>Wilt u een vervolgafspraak plannen? Laat ons weten wanneer het u uitkomt. We helpen u graag.</p><p>Met vriendelijke groet,<br />Uw tandheelkundig team</p></div><div className="film-approval-bottom"><span><ShieldCheck size={19} /> {approved ? 'Door u goedgekeurd' : 'Wacht op uw goedkeuring'}</span><motion.div className="film-approve-button" animate={{ scale: approved ? [1, .95, 1] : 1 }}><Check size={23} />{approved ? 'Goedgekeurd' : 'Goedkeuren'}</motion.div></div><motion.div className="film-pointer" aria-hidden="true" initial={{ x: 70, y: 85, opacity: 0 }} animate={{ x: 0, y: 0, opacity: [0, 1, 1, 0] }} transition={{ delay: 1, duration: 1.5 }}><MousePointer2 /></motion.div></div></div>
}

export function DentistScene({ time }: { time: number }) {
  const delivered = time > 1600
  return <div className="film-split"><SceneHeading eyebrow="CARE STAYS HUMAN" description="Administrative help from AI. Clinical judgement from your dental team.">Clinical questions<br />always go to<br /><em>the dentist.</em></SceneHeading><div className="film-handoff"><div className="film-clinical-message"><div className="film-icon-box"><MessageCircle /></div><div><span>KLINISCHE VRAAG</span><p lang="nl">Mijn wang is opgezwollen<br />sinds gisteren. Wat moet ik doen?</p></div></div><div className="film-transfer"><span /><motion.div animate={{ y: delivered ? 14 : 0, opacity: delivered ? 1 : .3 }}><ArrowRight /></motion.div><span /></div><motion.div className="film-dentist" animate={{ scale: delivered ? 1 : .97, opacity: delivered ? 1 : .5 }}><div className="film-dentist-icon"><Stethoscope /></div><strong>Uw tandarts</strong><span>{delivered ? 'Doorgestuurd voor beoordeling' : 'De juiste zorgverlener'}</span>{delivered && <motion.div className="film-handoff-confirmed" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><Check size={19} /> Human review required</motion.div>}</motion.div></div></div>
}

export function EndScene() {
  return <div className="film-end"><motion.div className="film-end-icon" initial={{ scale: .9 }} animate={{ scale: 1 }} transition={{ duration: 1 }}><Headphones /></motion.div><p className="film-eyebrow">AI ASSISTANTS FOR DUTCH DENTAL PRACTICES</p><h1><span>DentalOS</span><span className="film-end-dash">—</span><br />less admin,<br /><em>more care.</em></h1><motion.div className="film-end-contact" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .7 }}><p>Book a 15-minute demo <ArrowRight /></p><span>nabilmohammed367@gmail.com</span><small>All examples are illustrative.</small></motion.div></div>
}
