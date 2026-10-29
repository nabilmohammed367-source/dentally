import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_AUTH_PATHS = ['/login', '/signup', '/auth/callback', '/auth/signout', '/auth/update-password', '/setup-required', '/pending-access']

export async function updateSession(request: NextRequest) {
  const isApi = request.nextUrl.pathname.startsWith('/api/')
  const pathname = request.nextUrl.pathname
  const isPublicAuthPath = PUBLIC_AUTH_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`))
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    if (isApi) return NextResponse.json({ error: 'Authentication is not configured.' }, { status: 503 })
    if (isPublicAuthPath) return NextResponse.next({ request })
    return NextResponse.redirect(new URL('/setup-required', request.url))
  }

  let response = NextResponse.next({ request })
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() { return request.cookies.getAll() },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
      },
    },
  })

  const { data } = await supabase.auth.getClaims()
  const authenticated = typeof data?.claims?.sub === 'string'
  // API handlers return JSON 401/403 themselves; this proxy only refreshes their session.
  if (!isApi && !authenticated && !isPublicAuthPath) {
    const login = new URL('/login', request.url)
    login.searchParams.set('next', pathname)
    return NextResponse.redirect(login)
  }

  if (!isApi && authenticated && (pathname === '/login' || pathname === '/signup')) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
