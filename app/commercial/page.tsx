import type { Metadata, Viewport } from 'next'
import { DentalCommercial } from '@/components/commercial/dental-commercial'

export const metadata: Metadata = {
  title: 'DentalOS — Less admin, more care',
  description: 'Meet six AI assistants for Dutch dental practices in a 30-second DentalOS product film.',
  openGraph: { title: 'DentalOS — Less admin, more care', description: 'AI assistants for Dutch dental practices.', type: 'website' },
}
export const viewport: Viewport = { themeColor: '#ffffff', colorScheme: 'light' }

export default function CommercialPage() {
  return <DentalCommercial />
}
