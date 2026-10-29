import { AuthForm } from '@/components/auth/auth-form'
import { hasSupabaseConfig } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default function LoginPage() {
  if (!hasSupabaseConfig()) return <AuthSetupNotice />
  return <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-5"><AuthForm initialMode="login" /></main>
}

function AuthSetupNotice() {
  return <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-5"><section className="w-full max-w-lg rounded-2xl border bg-card p-7"><h1 className="text-2xl font-semibold">Sign-in is not configured yet</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">DentalOS live mode stays locked until Supabase Auth and the practice-membership table are configured. Follow the setup checklist provided with this build. Do not put patient data into the demo.</p></section></main>
}
