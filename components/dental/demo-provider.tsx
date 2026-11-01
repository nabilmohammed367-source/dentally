'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { createStore } from '@/lib/demo/seed'
import { liveStoreSchema, storeSchema, type Practice, type Store } from '@/lib/demo/types'
import { LIVE } from '@/lib/live'
import type { Envelope, Run } from '@/lib/live-actions'

const STORAGE_KEY = 'dentalos-demo-nl-v2'
const POLL_MS = 30000
const initial = createStore()
type DemoContextValue = { store: Store; practice: Practice; ready: boolean; update: (recipe: (p: Practice) => void, success?: string) => boolean; switchPractice: (id: string) => void; reset: () => void; revision: number; live: boolean; busy: boolean; connectionError: string | null; run: Run }
const DemoContext = createContext<DemoContextValue | null>(null)
export function DemoProvider({ children }: { children: ReactNode }) {
  const { data = initial, mutate } = useSWR<Store>('dentalos-demo', null, { fallbackData: initial, revalidateOnFocus: false })
  const current = useRef(data)
  const [ready, setReady] = useState(false)
  const [revision, setRevision] = useState(0)
  const warned = useRef(false)
  const activeId = useRef<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const generation = useRef(0)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  function commit(next: Store) {
    current.current = next; void mutate(next, { revalidate: false })
    if (LIVE) return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { if (!warned.current) { toast.warning('Browser storage is unavailable. Changes will last only for this session.'); warned.current = true } }
  }
  useEffect(() => {
    if (LIVE) {
      // Live mode: read the real snapshot from n8n and keep refreshing it.
      let stopped = false
      let failing = false
      let loading = false
      async function load() {
        if (loading || inFlight.current || document.visibilityState === 'hidden') return
        loading = true
        const startedAt = generation.current
        try {
          const res = await fetch('/api/dentalos/store', { cache: 'no-store', signal: AbortSignal.timeout(45_000) })
          const body = await res.json().catch(() => null)
          if (res.status === 401 || res.status === 403) { setReady(false); window.location.assign(res.status === 401 ? '/login' : '/pending-access'); return }
          if (!res.ok || !body) throw new Error(body?.error || `Server responded with status ${res.status}`)
          if (stopped || startedAt !== generation.current) return
          applyLiveStore(body.store)
          setConnectionError(null)
          if (failing) { toast.success('Reconnected to your live system.'); failing = false }
          setReady(true)
        } catch (error) {
          if (stopped || startedAt !== generation.current) return
          setConnectionError(error instanceof Error ? error.message : 'Could not load practice data.')
          if (!failing) { toast.error(error instanceof Error ? error.message : 'Could not load live data.'); failing = true }
        } finally { loading = false }
      }
      void load()
      const timer = setInterval(load, POLL_MS)
      document.addEventListener('visibilitychange', load)
      return () => { stopped = true; clearInterval(timer); document.removeEventListener('visibilitychange', load) }
    }
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = storeSchema.safeParse(JSON.parse(saved))
        if (parsed.success) { current.current = parsed.data; void mutate(parsed.data, { revalidate: false }) }
        else toast.info('Saved demo data was incompatible. A fresh sample workspace was loaded.')
      }
    } catch { toast.info('Saved demo data could not be loaded. Using fictional sample records.') }
    setReady(true)
  }, [mutate])
  const skippedWarned = useRef(0)
  // Drop records that point at a patient who does not exist, instead of rejecting everything.
  function cleanLiveStore(raw: any): { store: unknown; skipped: number } {
    let skipped = 0
    if (!raw || !Array.isArray(raw.practices)) return { store: raw, skipped }
    for (const p of raw.practices) {
      const ids = new Set((p.patients ?? []).map((x: any) => x.id))
      const keep = (list: any[] | undefined, ok: (x: any) => boolean) => { const all = list ?? []; const kept = all.filter(ok); skipped += all.length - kept.length; return kept }
      p.appointments = keep(p.appointments, a => ids.has(a.patientId))
      p.conversations = keep(p.conversations, c => ids.has(c.patientId))
      p.approvals = keep((p.approvals ?? []).map((a: any) => ({ ...a, patientIds: (a.patientIds ?? []).filter((id: string) => ids.has(id)) })), a => a.patientIds.length > 0)
    }
    if (!raw.practices.some((p: any) => p.id === raw.activeId) && raw.practices[0]) raw.activeId = raw.practices[0].id
    return { store: raw, skipped }
  }
  function applyLiveStore(raw: unknown) {
    const cleaned = cleanLiveStore(raw)
    if (cleaned.skipped > 0 && cleaned.skipped !== skippedWarned.current) {
      toast.warning(`${cleaned.skipped} record(s) in n8n point to a patient that does not exist and were hidden. Check the data tables.`)
      skippedWarned.current = cleaned.skipped
    }
    const parsed = liveStoreSchema.safeParse(cleaned.store)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      throw new Error(`Live data did not match the dashboard format (${issue?.path.map(String).join('.')}: ${issue?.message})`)
    }
    const next = parsed.data
    if (activeId.current && next.practices.some(p => p.id === activeId.current)) next.activeId = activeId.current
    activeId.current = next.activeId
    current.current = next; void mutate(next, { revalidate: false })
  }
  // Calls a real DentalOS agent in n8n, then shows its own reply and the updated data.
  const run: Run = async (workflow, action, payload, options) => {
    if (!LIVE) { toast.info('Connect the live system to run real agents.'); return null }
    if (inFlight.current) { toast.info('Please wait for the current change to finish.'); return null }
    inFlight.current = true
    generation.current += 1
    setBusy(true)
    try {
      const res = await fetch('/api/dentalos/action', { method: 'POST', signal: AbortSignal.timeout(75_000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workflow, action, payload, practice_id: current.current.activeId }) })
      const body = (await res.json().catch(() => null)) as (Envelope & { error?: string }) | null
      if (res.status === 401) { setReady(false); window.location.assign('/login'); return null }
      if (!res.ok || !body) throw new Error(body?.error || `Server responded with status ${res.status}`)
      if (body.success === false) { toast.error(body.message || 'The agent could not complete that.'); return null }
      if (body.store) { try { applyLiveStore(body.store) } catch { /* the next refresh will pick it up */ } }
      if (!options?.quiet && body.message) toast.success(body.message)
      return body
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reach the live system.')
      return null
    } finally { inFlight.current = false; generation.current += 1; setBusy(false) }
  }
  function update(recipe: (p: Practice) => void, success = 'Demo updated') {
    if (!ready) return false
    if (LIVE) {
      // Changes without a supported live action must not mutate only browser state.
      toast.info('This edit is not connected to the live system.')
      return false
    }
    const next = structuredClone(current.current)
    const p = next.practices.find(p => p.id === next.activeId)!
    try { recipe(p); commit(next); if (success) toast.success(success); return true }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to complete this action.'); return false }
  }
  function switchPractice(id: string) {
    if (!current.current.practices.some(p => p.id === id)) return
    activeId.current = id
    commit({ ...current.current, activeId: id })
  }
  function reset() {
    if (LIVE) { toast.info('Reset is not available in live mode. Your real data lives in n8n.'); return }
    commit(createStore()); setRevision(v => v + 1); toast.success('All fictional practices have been reset.')
  }
  return <DemoContext.Provider value={{ store: data, practice: data.practices.find(p => p.id === data.activeId) ?? data.practices[0], ready, update, switchPractice, revision, reset, live: LIVE, busy, connectionError, run }}>{children}</DemoContext.Provider>
}
export function useDemo() { const context = useContext(DemoContext); if (!context) throw new Error('DemoProvider is required'); return context }
