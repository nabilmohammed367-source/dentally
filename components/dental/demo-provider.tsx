'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { createStore } from '@/lib/demo/seed'
import { storeSchema, type Practice, type Store } from '@/lib/demo/types'
import type { Envelope, Workflow } from '@/lib/n8n/engine'

const STORAGE_KEY = 'dentalos-demo-v1'
const initial = createStore()
type Action = { workflow: Workflow; action: string; payload?: Record<string, unknown> }
type Config = { configured: boolean; missing: string[]; unlocked: boolean }
export async function demoRequest(body: Record<string, unknown>) { const res = await fetch('/api/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const data = await res.json(); if (!res.ok) throw new Error(data.message ?? 'Demo request failed.'); return data }
type DemoContextValue = { store: Store; practice: Practice; ready: boolean; update: (recipe: (p: Practice) => void, success?: string) => boolean; switchPractice: (id: string) => void; reset: () => void; revision: number; connected: boolean; setConnected: (v: boolean) => void; config?: Config; error: string; pending: boolean; result: Envelope | null; command: (action: Action) => Promise<Envelope | null>; act: (action: Action, recipe: (p: Practice) => void, success?: string) => Promise<boolean>; refresh: () => Promise<void>; unlock: (key: string) => Promise<void> }
const DemoContext = createContext<DemoContextValue | null>(null)
export function DemoProvider({ children, localOnly = false }: { children: ReactNode; localOnly?: boolean }) {
  const storageKey = localOnly ? 'vaqor-public-demo-v1' : STORAGE_KEY
  const { data = initial, mutate } = useSWR<Store>(localOnly ? 'vaqor-public-demo' : 'dentalos-demo', null, { fallbackData: initial, revalidateOnFocus: false })
  const { data: config, mutate: refreshConfig } = useSWR<Config>(localOnly ? null : '/api/demo', async url => { const r = await fetch(url); if (!r.ok) throw new Error('Cannot check connection configuration.'); return r.json() }, { revalidateOnFocus: false, shouldRetryOnError: false })
  const current = useRef(data)
  const [localReady, setReady] = useState(false)
  const [revision, setRevision] = useState(0)
  const [connected, changeMode] = useState(false)
  const [remoteId, setRemoteId] = useState('oakwood')
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState('')
  const [result, setResult] = useState<Envelope | null>(null)
  const busy = useRef(false)
  const generation = useRef(0)
  const remote = useSWR<Envelope>(!localOnly && connected && config?.unlocked ? ['n8n-demo-state', remoteId] : null, () => demoRequest({ operation: 'state', practice_id: remoteId }), { revalidateOnFocus: false, shouldRetryOnError: false })
  const warned = useRef(false)
  function commit(next: Store) {
    current.current = next; void mutate(next, { revalidate: false })
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { if (!warned.current) { toast.warning('Browser storage is unavailable. Changes will last only for this session.'); warned.current = true } }
  }
  useEffect(() => {
    try { const saved = localStorage.getItem(storageKey); if (saved) { const parsed = storeSchema.safeParse(JSON.parse(saved)); if (parsed.success) { current.current = parsed.data; void mutate(parsed.data, { revalidate: false }) } else toast.info('Saved demo data was incompatible. A fresh sample workspace was loaded.') } } catch { toast.info('Saved demo data could not be loaded. Using fictional sample records.') }
    try { if (!localOnly && localStorage.getItem('dentalos-backend-mode') === 'n8n') changeMode(true) } catch {}
    setReady(true)
  }, [mutate, localOnly, storageKey])
  function update(recipe: (p: Practice) => void, success = 'Demo updated') {
    if (connected) { toast.error('This action is not wired to n8n. No local records were changed.'); return false }
    if (!localReady) return false
    const next = structuredClone(current.current); const p = next.practices.find(p => p.id === next.activeId)!
    try { recipe(p); commit(next); if (success) toast.success(success); return true } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to complete this action.'); return false }
  }
  async function refresh() { if (localOnly) return; setActionError(''); await refreshConfig(); if (connected && config?.unlocked) await remote.mutate() }
  async function command(action: Action) {
    if (localOnly || !connected || busy.current) return null
    busy.current = true; setPending(true); setActionError(''); setResult(null); const version = generation.current
    try {
      const reply: Envelope = await demoRequest({ operation: 'action', workflow: action.workflow, action: action.action, payload: action.payload ?? {}, practice_id: remoteId, request_id: crypto.randomUUID() })
      if (version !== generation.current) return null
      setResult(reply); if (reply.store) await remote.mutate(reply, { revalidate: false }); await remote.mutate(); toast.success(reply.message); return reply
    } catch (e) { if (version === generation.current) { const text = e instanceof Error ? e.message : 'Workflow failed.'; setActionError(text); toast.error(text) } return null }
    finally { busy.current = false; setPending(false) }
  }
  async function act(action: Action, recipe: (p: Practice) => void, success?: string) { return connected ? !!await command(action) : update(recipe, success) }
  function switchPractice(id: string) { if (busy.current) return; generation.current++; setResult(null); setActionError(''); if (connected) { if (['oakwood', 'riverside', 'brighton'].includes(id)) setRemoteId(id) } else if (current.current.practices.some(p => p.id === id)) commit({ ...current.current, activeId: id }) }
  const store = connected ? { ...(remote.data?.store ?? initial), activeId: remoteId } : data
  return <DemoContext.Provider value={{ store, practice: store.practices.find(p => p.id === store.activeId)!, ready: localReady && (!connected || !!remote.data?.store && !remote.error && !!config?.unlocked), connected, setConnected: v => { if (localOnly || busy.current) return; generation.current++; changeMode(v); try { localStorage.setItem('dentalos-backend-mode', v ? 'n8n' : 'local') } catch {} setRevision(r => r + 1); setResult(null); setActionError('') }, config, error: actionError || (remote.error instanceof Error ? remote.error.message : ''), pending, result, command, act, refresh, unlock: async key => { if (localOnly) return; await demoRequest({ operation: 'unlock', key }); await refreshConfig() }, update, switchPractice, revision, reset: () => { if (connected) { void command({ workflow: 'setup', action: 'reset', payload: { confirm: 'RESET THIS SESSION' } }).then(reply => { if (reply) setRevision(v => v + 1) }); return } commit(createStore()); setRevision(v => v + 1); toast.success('All fictional practices have been reset.') } }}>{children}</DemoContext.Provider>
}
export function useDemo() { const context = useContext(DemoContext); if (!context) throw new Error('DemoProvider is required'); return context }
