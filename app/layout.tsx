import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })
export const metadata: Metadata = {
  title: 'DentalOS — A little less admin. A lot more care.',
  description: 'Explore a multi-practice dental operations demo with a simulated AI team, appointment management, patient support and staff approvals. Fictional data only.',
  robots: { index: false, follow: false },
}
export const viewport: Viewport = { colorScheme: 'light', themeColor: '#172d30' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`light bg-background ${geist.variable}`}><body className="font-sans antialiased">{children}</body></html>
}
