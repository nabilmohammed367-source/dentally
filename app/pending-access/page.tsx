import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient, hasSupabaseConfig } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function PendingAccessPage() {
  if (!hasSupabaseConfig()) redirect('/setup-required')
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims?.sub) redirect('/login')
  const email = typeof data.claims.email === 'string' ? data.claims.email : 'your account'
  return <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-5"><section className="w-full max-w-lg rounded-2xl border bg-card p-7"><div className="mb-5 text-xl font-semibold tracking-tight">dental<span className="font-normal text-muted-foreground">os</span><span className="text-primary">.</span></div><h1 className="text-2xl font-semibold">Practice access needs approval</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">The account {email} is verified, but no practice has been assigned. A practice administrator must approve and assign access before patient or appointment data is available.</p><form action="/auth/signout" method="post" className="mt-6"><button className="text-sm text-primary underline-offset-4 hover:underline">Sign out</button></form><Link className="mt-3 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline" href="/login">Return to sign in</Link></section></main>
}
