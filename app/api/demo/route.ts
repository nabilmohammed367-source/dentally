import { createHmac, randomUUID, timingSafeEqual, createHash } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { storeSchema } from '@/lib/demo/types'
import { routes } from '@/lib/n8n/engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const COOKIE = 'dentalos-presenter'
const variables = ['N8N_WEBHOOK_BASE_URL', 'N8N_WEBHOOK_SECRET', 'N8N_DEMO_ACCESS_KEY'] as const
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
function config() { return { base: process.env.N8N_WEBHOOK_BASE_URL, secret: process.env.N8N_WEBHOOK_SECRET, access: process.env.N8N_DEMO_ACCESS_KEY } }
function equal(a: string, b: string) { return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest()) }
function signature(value: string) { return createHmac('sha256', config().secret ?? '').update(value).digest('hex') }
async function session() { const cookie = (await cookies()).get(COOKIE)?.value; if (!cookie || !config().secret) return null; const [id, expires, sig, extra] = cookie.split('.'); if (extra || !/^[a-f0-9-]{36}$/.test(id ?? '') || !expires || !sig || Number(expires) < Date.now() || !equal(sig, signature(`${id}.${expires}`))) return null; return id }
export async function GET() { return response({ configured: variables.every(v => !!process.env[v]), missing: variables.filter(v => !process.env[v]), unlocked: !!await session() }) }
const requestSchema = z.object({ operation: z.enum(['unlock', 'lock', 'state', 'action']), key: z.string().max(300).optional(), workflow: z.enum(routes).optional(), action: z.string().min(1).max(60).optional(), practice_id: z.enum(['oakwood', 'riverside', 'brighton']).default('oakwood'), request_id: z.string().uuid().optional(), payload: z.record(z.string(), z.unknown()).default({}) }).strict()
const replySchema = z.object({ version: z.literal(1), demo: z.literal(true), success: z.boolean(), request_id: z.string(), message: z.string(), result: z.record(z.string(), z.unknown()), store: storeSchema.nullable(), error: z.string().optional() })
export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin || origin !== new URL(request.url).origin) return response({ message: 'Cross-origin request rejected.' }, 403)
  if (!request.headers.get('content-type')?.startsWith('application/json')) return response({ message: 'JSON required.' }, 415)
  if (Number(request.headers.get('content-length') ?? 0) > 20000) return response({ message: 'Request too large.' }, 413)
  let text: string
  try { const reader = request.body?.getReader(); if (!reader) return response({ message: 'Request body required.' }, 400); const chunks: Uint8Array[] = []; let size = 0; while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 20000) { await reader.cancel(); return response({ message: 'Request too large.' }, 413) } chunks.push(value) } text = Buffer.concat(chunks).toString('utf8') } catch { return response({ message: 'Cannot read request.' }, 400) }
  let body: z.infer<typeof requestSchema>
  try { body = requestSchema.parse(JSON.parse(text)) } catch { return response({ message: 'Invalid demo command.' }, 400) }
  const { base, secret, access } = config()
  if (!base || !secret || !access) return response({ message: 'Configure the three n8n variables in project settings first.', code: 'UNCONFIGURED' }, 503)
  if (secret.length < 24 || access.length < 16) return response({ message: 'Use a webhook secret of at least 24 characters and presenter key of at least 16 characters.' }, 503)
  if (body.operation === 'unlock') {
    if (!body.key || !equal(body.key, access)) { await new Promise(resolve => setTimeout(resolve, 1000)); return response({ message: 'Presenter access key not accepted.' }, 401) }
    const id = await session() ?? randomUUID(); const expires = Date.now() + 12 * 60 * 60 * 1000; const value = `${id}.${expires}`
    const res = response({ success: true }); res.cookies.set(COOKIE, `${value}.${signature(value)}`, { httpOnly: true, secure: true, sameSite: 'none', partitioned: true, path: '/', maxAge: 12 * 60 * 60 }); return res
  }
  if (body.operation === 'lock') { const res = response({ success: true }); res.cookies.set(COOKIE, '', { httpOnly: true, secure: true, sameSite: 'none', partitioned: true, path: '/', maxAge: 0 }); return res }
  const id = await session(); if (!id) return response({ message: 'Unlock the connected demo with your presenter key.', code: 'LOCKED' }, 401)
  let url: URL
  try { url = new URL(base); if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !url.pathname.replace(/\/$/, '').endsWith('/webhook')) throw new Error(); } catch { return response({ message: 'N8N_WEBHOOK_BASE_URL must be an HTTPS production webhook base, ending in /webhook.' }, 503) }
  const workflow = body.operation === 'state' ? 'state' : body.workflow
  if (!workflow || (body.operation === 'action' && !body.action)) return response({ message: 'Workflow and action required.' }, 400)
  const requestId = body.request_id ?? randomUUID()
  url.pathname = url.pathname.replace(/\/$/, '') + '/dentalos-demo/' + workflow
  try {
    const upstream = await fetch(url, { method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(25000), headers: { 'Content-Type': 'application/json', 'X-DentalOS-Key': secret }, body: JSON.stringify({ workflow, action: body.operation === 'state' ? 'read' : body.action, payload: body.payload, practice_id: body.practice_id, request_id: requestId, demo_session_id: id }) })
    if (!upstream.ok) { const message = upstream.status === 404 ? 'Webhook not found. Import and publish the revised workflow in n8n.' : [401, 403].includes(upstream.status) ? 'n8n rejected the webhook credential. Check Header Auth.' : 'n8n execution failed. Check table columns, bindings, and the failed execution in n8n.'; return response({ message, code: 'UPSTREAM_ERROR', request_id: requestId }, 502) }
    const parsed = replySchema.safeParse(await upstream.json())
    if (!parsed.success || parsed.data.request_id !== requestId) return response({ message: 'Unexpected n8n response. Use the revised exports; “workflow started” is not completion.', code: 'INVALID_RESPONSE', request_id: requestId }, 502)
    return response(parsed.data, parsed.data.success ? 200 : 409)
  } catch { return response({ message: 'n8n could not be reached or the request timed out. Its outcome may be unknown. Refresh state before trying a new action; no automatic retry was sent.', code: 'OUTCOME_UNKNOWN', request_id: requestId }, 502) }
}
