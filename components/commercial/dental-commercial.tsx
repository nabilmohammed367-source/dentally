'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'framer-motion'
import { Headphones, RotateCcw } from 'lucide-react'
import { ApprovalScene, CalendarScene, ChatScene, DentistScene, EndScene, PhoneScene, TeamScene } from './commercial-scenes'
import styles from './commercial.module.css'

const STARTS = [0, 5500, 11000, 16500, 22000, 27500, 33000]
const DURATION = 38000

export function DentalCommercial() {
  const container = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [take, setTake] = useState(0)
  const reduced = useReducedMotion()

  useEffect(() => {
    const element = container.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setScale(Math.min(entry.contentRect.width / 1920, entry.contentRect.height / 1080)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let previous = performance.now()
    let playhead = 0
    const timer = window.setInterval(() => {
      const now = performance.now()
      if (!document.hidden) playhead = Math.min(DURATION, playhead + now - previous)
      previous = now
      setElapsed(playhead)
      if (playhead >= DURATION) window.clearInterval(timer)
    }, 80)
    const onVisibility = () => { previous = performance.now() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility) }
  }, [take])

  const scene = STARTS.findLastIndex(start => elapsed >= start)
  const sceneTime = elapsed - STARTS[scene]
  const complete = elapsed >= DURATION
  const content = [<PhoneScene key="phone" time={sceneTime} />, <TeamScene key="team" />, <ChatScene key="chat" time={sceneTime} />, <CalendarScene key="calendar" time={sceneTime} />, <ApprovalScene key="approval" time={sceneTime} />, <DentistScene key="dentist" time={sceneTime} />, <EndScene key="end" />][scene]

  return <MotionConfig reducedMotion="user"><main ref={container} className={`${styles.viewport} font-sans`} aria-label="DentalOS 30-second product commercial"><div className={styles.canvas} style={{ transform: `scale(${scale ?? 0})`, visibility: scale === null ? 'hidden' : 'visible' }} data-scene={scene} data-complete={complete}>
    <header className="film-header"><div className="film-brand"><span className="film-brand-icon"><Headphones /></span>Dental<span>OS</span></div><div className="film-header-note"><i /> A little less admin. A lot more care.</div></header>
    <div className="film-scene-stage" aria-live="off"><AnimatePresence mode="wait"><motion.section key={`${take}-${scene}`} className="film-scene" initial={{ opacity: 0, y: reduced ? 0 : 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -12 }} transition={{ duration: reduced ? .12 : .4, ease: [.22, 1, .36, 1] }}>{content}</motion.section></AnimatePresence></div>
    <footer className="film-footer"><div className="film-chapters" aria-hidden="true">{STARTS.map((start, index) => <span key={start}><i style={{ transform: `scaleX(${Math.min(1, Math.max(0, (elapsed - start) / ((STARTS[index + 1] ?? DURATION) - start)))})` }} /></span>)}</div></footer>
  </div>{complete && <motion.button className={styles.replay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => { setElapsed(0); setTake(value => value + 1) }}><RotateCcw size={16} /> Replay film</motion.button>}
  <div className="sr-only"><h2>Commercial transcript</h2><p>Your phone never stops ringing. Meet your new practice team: Ava, Receptionist; Milo, Patient support; Luna, Reminders and recall; Finn, Waitlist; Iris, Follow-up; Leo, Daily briefing.</p><p lang="nl">Patiënt: Hoe laat zijn jullie open? Milo: Wij zijn open van maandag tot en met vrijdag, van 9:00 tot 17:00 uur.</p><p>Cancelled appointment? Filled from the waitlist. Nothing goes out without your approval. Clinical questions always go to the dentist. DentalOS — less admin, more care. Book a 15-minute demo. YOUR-EMAIL-HERE. All examples are illustrative.</p></div>
  </main></MotionConfig>
}
