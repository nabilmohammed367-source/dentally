import { NextResponse } from 'next/server'
import { ALLOWED_PRACTICES, callN8n } from '@/lib/n8n-server'
import { guardBrowserRequest } from '@/lib/request-guard'
import { getPracticeAccess } from '@/lib/auth'
import { getDentalStore } from '@/lib/dentalos-service'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const blocked = guardBrowserRequest(request)
  if (blocked) return blocked
  const result = await getDentalStore(await getPracticeAccess(), ALLOWED_PRACTICES, callN8n)
  return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'private, no-store' } })
}
