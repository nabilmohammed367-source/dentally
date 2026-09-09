import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })
export const metadata: Metadata = {
  title: 'Vaqor AI — Thoughtful automation for dental practices',
  description: 'Vaqor AI builds dental-practice workflows for reception, patient support, reminders, waitlists, follow-ups, and operations. Explore our interactive DentalOS sample.',
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Vaqor AI — More time for patients. Less busywork.',
    description: 'Thoughtful automation for the work behind the care. Explore our dental-practice solutions and interactive DentalOS demo.',
    type: 'website',
    siteName: 'Vaqor AI',
  },
}
export const viewport: Viewport = { colorScheme: 'light', themeColor: '#172d30' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`light bg-background ${geist.variable}`}><body className="font-sans antialiased">{children}</body></html>
}
