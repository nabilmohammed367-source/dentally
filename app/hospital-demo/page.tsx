import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Hospital AI OS Demo | Vaqor AI',
  description: 'Explore a fictional hospital operations workspace with staff-reviewed bed coordination, discharge planning, follow-up tasks and documentation.',
  robots: { index: false, follow: false },
}

export default function HospitalDemoPage() {
  return (
    <main className="flex h-dvh flex-col bg-background font-sans text-foreground">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3 text-sm">
        <Link href="/" className="font-medium underline-offset-4 hover:underline">← Vaqor AI</Link>
        <a href="/downloads/hospital-ai-os.html" download="hospital-ai-os.html" className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground">Download standalone HTML</a>
      </header>
      <iframe src="/downloads/hospital-ai-os.html" title="Hospital AI OS interactive fictional sample" className="min-h-0 w-full flex-1 border-0" />
    </main>
  )
}
