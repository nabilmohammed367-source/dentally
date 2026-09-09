import type { Metadata } from 'next'
import { DentalApp } from '@/components/dental/dental-app'

export const metadata: Metadata = {
  title: 'DentalOS presenter workspace | Vaqor AI',
  description: 'Presenter controls, n8n demo configuration, and workflow exports.',
  robots: { index: false, follow: false },
}

export default function PresenterPage() {
  return <DentalApp />
}
