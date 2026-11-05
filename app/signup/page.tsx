import { AuthForm } from '@/components/auth/auth-form'
import { hasSupabaseConfig } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default function SignupPage() {
  if (!hasSupabaseConfig()) return <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-5"><section className="w-full max-w-lg rounded-2xl border bg-card p-7"><h1 className="text-2xl font-semibold">Sign-up is not configured yet</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Live access stays locked until authentication and practice access are configured.</p></section></main>
  return <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-5"><AuthForm initialMode="signup" /></main>
}
