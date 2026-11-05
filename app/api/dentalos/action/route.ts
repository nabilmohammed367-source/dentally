import { NextResponse } from 'next/server'
import { ALLOWED_PRACTICES, callN8n } from '@/lib/n8n-server'
import { guardBrowserRequest } from '@/lib/request-guard'
import { getPracticeAccess } from '@/lib/auth'
import { runDentalAction } from '@/lib/dentalos-service'
import { readJsonBody } from '@/lib/request-body'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const blocked = guardBrowserRequest(request, true)
  if (blocked) return blocked
  const access = await getPracticeAccess()
  const input = await readJsonBody(request)
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: input.status, headers: { 'Cache-Control': 'private, no-store' } })
  const result = await runDentalAction(input.value, access, ALLOWED_PRACTICES, callN8n)
  return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'private, no-store' } })
}
