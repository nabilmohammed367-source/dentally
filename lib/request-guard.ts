import { NextResponse } from 'next/server'

/**
 * Reject browser requests initiated by another origin. The dashboard's own
 * same-origin fetches pass; server-side scripts without browser headers remain
 * supported. This is a CSRF mitigation, not a replacement for authentication.
 */
export function guardBrowserRequest(request: Request, requireJson = false) {
  const requestUrl = new URL(request.url)
  // Next may reconstruct request.url with an internal hostname when running
  // behind a local proxy. The incoming Host header reflects the browser-facing
  // host that received this request, so use it for the origin comparison.
  const requestHost = request.headers.get('host')
  const origin = request.headers.get('origin')
  let originVerified = false
  if (origin) {
    try {
      const originUrl = new URL(origin)
      if (originUrl.protocol !== requestUrl.protocol || (requestHost && originUrl.host !== requestHost) || (!requestHost && originUrl.origin !== requestUrl.origin)) {
        return NextResponse.json({ error: 'Cross-origin request blocked.' }, { status: 403 })
      }
      originVerified = true
    } catch {
      return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })
    }
  }

  const fetchSite = request.headers.get('sec-fetch-site')
  // Origin is the stricter check when present. Some embedded browsers report
  // cross-site Fetch Metadata for a same-origin request; use it only as a
  // fallback for clients that omit Origin.
  if (!originVerified && fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return NextResponse.json({ error: 'Cross-origin request blocked.' }, { status: 403 })
  }

  if (requireJson && !/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) {
    return NextResponse.json({ error: 'Content-Type must be application/json.' }, { status: 415 })
  }

  return null
}
