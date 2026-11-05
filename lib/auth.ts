import { createSupabaseServerClient, hasSupabaseConfig } from '@/lib/supabase/server'

export type PracticeAccess =
  | { status: 'ready'; userId: string; email: string | null; practiceId: string; role: string }
  | { status: 'setup' | 'signed_out' | 'unassigned' | 'unavailable' }

export async function getPracticeAccess(): Promise<PracticeAccess> {
  if (!hasSupabaseConfig()) return { status: 'setup' }
  try {
    const supabase = await createSupabaseServerClient()
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
    const claims = claimsData?.claims
    const userId = typeof claims?.sub === 'string' ? claims.sub : null
    if (claimsError && (claimsError.name === 'AuthRetryableFetchError' || (claimsError.status ?? 0) >= 500)) return { status: 'unavailable' }
    if (claimsError || !userId) return { status: 'signed_out' }

    const { data: membership, error } = await supabase
      .from('practice_memberships')
      .select('practice_id, role')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) return { status: 'unavailable' }
    if (!membership || typeof membership.practice_id !== 'string') return { status: 'unassigned' }

    return {
      status: 'ready',
      userId,
      email: typeof claims?.email === 'string' ? claims.email : null,
      practiceId: membership.practice_id,
      role: typeof membership.role === 'string' ? membership.role : 'staff',
    }
  } catch {
    return { status: 'unavailable' }
  }
}
