import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { guardBrowserRequest } from '@/lib/request-guard'

export async function POST(request: Request) {
  const blocked = guardBrowserRequest(request)
  if (blocked) return blocked
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
}
