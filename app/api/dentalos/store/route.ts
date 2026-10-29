import { NextResponse } from 'next/server'
import { callN8n } from '@/lib/n8n-server'
import { DEMO_DATE } from '@/lib/demo/types'
import { guardBrowserRequest } from '@/lib/request-guard'
import { getPracticeAccess } from '@/lib/auth'

export const dynamic = 'force-dynamic'

function nextWeekday(): string {
  const d = new Date(`${DEMO_DATE}T12:00:00Z`)
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export async function GET(request: Request) {
  const blocked = guardBrowserRequest(request)
  if (blocked) return blocked
  const access = await getPracticeAccess()
  if (access.status === 'signed_out') return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 })
  if (access.status === 'unassigned') return NextResponse.json({ error: 'Your account has not been assigned to a practice.' }, { status: 403 })
  if (access.status !== 'ready') return NextResponse.json({ error: 'Authentication or practice access is not configured.' }, { status: 503 })
  // A read-only call: asking Ava for availability also returns the full current snapshot.
  const result = await callN8n('ava', 'availability', { date: nextWeekday() }, access.practiceId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  if (!result.body.store) return NextResponse.json({ error: result.body.message || 'n8n returned no data' }, { status: 502 })
  const practices = result.body.store.practices
  if (!Array.isArray(practices)) return NextResponse.json({ error: 'n8n returned an invalid practice snapshot.' }, { status: 502 })
  const practice = practices.find((item: any) => item?.id === access.practiceId)
  if (!practice) return NextResponse.json({ error: 'The assigned practice is not available in DentalOS.' }, { status: 404 })
  return NextResponse.json({ store: { ...result.body.store, activeId: access.practiceId, practices: [practice] } }, { headers: { 'Cache-Control': 'private, no-store' } })
}
