import type { Metadata } from 'next'
import { DentalApp } from '@/components/dental/dental-app'

export const metadata: Metadata = {
  title: 'DentalOS sample demo | Vaqor AI',
  description: 'Try a fictional dental practice dashboard with scripted agents, bookings, patient support, and staff approvals. No real patient data or messaging.',
  robots: { index: false, follow: true },
}

export default function DemoPage() {
  return <DentalApp publicDemo />
}
