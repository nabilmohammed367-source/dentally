// Server-only helper: forwards a request to one of the DentalOS n8n webhooks.
// Runs on the Next.js server, so the access key never reaches the browser.
export const ALLOWED_WORKFLOWS = ['ava', 'milo', 'luna', 'finn', 'iris', 'leo', 'approvals', 'state'] as const
const DEFAULT_PRACTICES = ['prac_oakwood', 'prac_riverside', 'prac_harbor']
const practiceIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{2,99}$/
const configuredPracticeList = process.env.DENTALOS_ALLOWED_PRACTICES
const configuredPractices = (configuredPracticeList || '')
  .split(',')
  .map(id => id.trim())
  .filter(id => practiceIdPattern.test(id))

// Production operators must explicitly enumerate provisioned practice IDs.
// The fallback keeps the local synthetic workspace working out of the box.
export const ALLOWED_PRACTICES = configuredPracticeList !== undefined
  ? [...new Set(configuredPractices)]
  : process.env.NODE_ENV === 'production' ? [] : DEFAULT_PRACTICES

export type N8nResult = { ok: true; body: any } | { ok: false; status: number; error: string }

export async function callN8n(workflow: string, action: string, payload: Record<string, unknown>, practiceId: string): Promise<N8nResult> {
  const base = process.env.DENTALOS_WEBHOOK_BASE_URL
  const key = process.env.DENTALOS_WEBHOOK_SECRET
  if (!base || !key) return { ok: false, status: 500, error: 'DENTALOS_WEBHOOK_BASE_URL or DENTALOS_WEBHOOK_SECRET is missing from .env.local' }
  try {
    const res = await fetch(`${base}/${workflow}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-DentalOS-Key': key },
      body: JSON.stringify({ action, payload, practice_id: practiceId, demo_session_id: 'dashboard-live-0001', request_id: 'dash-' + crypto.randomUUID() }),
      cache: 'no-store',
    })
    const body = await res.json().catch(() => null)
    if (res.status === 401 || res.status === 403) return { ok: false, status: 502, error: 'n8n rejected the access key. Check DENTALOS_WEBHOOK_SECRET matches your Header Auth credential.' }
    if (res.status === 404) return { ok: false, status: 502, error: `n8n has no active "${workflow}" connection. Is that workflow published?` }
    if (!res.ok || !body) return { ok: false, status: 502, error: `n8n responded with status ${res.status}` }
    return { ok: true, body }
  } catch {
    return { ok: false, status: 502, error: `Could not reach n8n at ${base}. Is it running?` }
  }
}
