import { redirect } from 'next/navigation'
import { UpdatePasswordForm } from '@/components/auth/auth-form'
import { createSupabaseServerClient, hasSupabaseConfig } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function UpdatePasswordPage() {
  if (!hasSupabaseConfig()) redirect('/setup-required')
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims?.sub) redirect('/login')
  return <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-5"><UpdatePasswordForm /></main>
}
