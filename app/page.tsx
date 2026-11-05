import { DentalApp } from '@/components/dental/dental-app'
import { getPracticeAccess } from '@/lib/auth'
import { LIVE } from '@/lib/live'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function Page() {
  if (!LIVE) return <DentalApp />
  const access = await getPracticeAccess()
  if (access.status !== 'ready') {
    if (access.status === 'setup' || access.status === 'unavailable') redirect('/setup-required')
    if (access.status === 'signed_out') redirect('/login')
    redirect('/pending-access')
  }
  return <DentalApp userEmail={access.email} accountRole={access.role} canManage={access.role === 'owner' || access.role === 'admin'} />
}
