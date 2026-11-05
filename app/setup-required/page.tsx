export const dynamic = 'force-dynamic'

export default function SetupRequiredPage() {
  return <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-5"><section className="w-full max-w-lg rounded-2xl border bg-card p-7"><div className="mb-5 text-xl font-semibold tracking-tight">dental<span className="font-normal text-muted-foreground">os</span><span className="text-primary">.</span></div><h1 className="text-2xl font-semibold">Live access is safely locked</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Authentication isn’t configured, so DentalOS has blocked access to live data. Configure Supabase URL and publishable key, run the membership-table migration, and provision the first practice owner before enabling live mode.</p><p className="mt-4 text-xs leading-5 text-muted-foreground">The public synthetic-data demo can remain available separately. Never add a Supabase service-role key to browser code.</p></section></main>
}
