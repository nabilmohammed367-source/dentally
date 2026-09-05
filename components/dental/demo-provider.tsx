'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { createStore } from '@/lib/demo/seed'
import { storeSchema, type Practice, type Store } from '@/lib/demo/types'

const STORAGE_KEY = 'dentalos-demo-v1'
const initial = createStore()
type DemoContextValue = { store: Store; practice: Practice; ready: boolean; update: (recipe: (p: Practice) => void, success?: string) => boolean; switchPractice: (id: string) => void; reset: () => void }
const DemoContext = createContext<DemoContextValue | null>(null)
export function DemoProvider({ children }: { children: ReactNode }) {
  const { data = initial, mutate } = useSWR<Store>('dentalos-demo', null, { fallbackData: initial, revalidateOnFocus: false })
  const current = useRef(data)
  const [ready, setReady] = useState(false)
  const warned = useRef(false)
  function commit(next: Store) {
    current.current = next; void mutate(next, { revalidate: false })
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { if (!warned.current) { toast.warning('Browser storage is unavailable. Changes will last only for this session.'); warned.current = true } }
  }
  useEffect(() => {
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
  function update(recipe: (p: Practice) => void, success = 'Demo updated') {
    if (!ready) return false
    const next = structuredClone(current.current)
    const p = next.practices.find(p => p.id === next.activeId)!
    try { recipe(p); commit(next); if (success) toast.success(success); return true }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to complete this action.'); return false }
  }
  function switchPractice(id: string) { if (current.current.practices.some(p => p.id === id)) commit({ ...current.current, activeId: id }) }
  return <DemoContext.Provider value={{ store: data, practice: data.practices.find(p => p.id === data.activeId)!, ready, update, switchPractice, reset: () => { commit(createStore()); toast.success('All fictional practices have been reset.') } }}>{children}</DemoContext.Provider>
}
export function useDemo() { const context = useContext(DemoContext); if (!context) throw new Error('DemoProvider is required'); return context }
