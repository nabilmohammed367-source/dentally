'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

type Mode = 'login' | 'signup' | 'reset'

export function AuthForm({ initialMode }: { initialMode: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setMessage(''); setError('')
    try {
      const supabase = createSupabaseBrowserClient()
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
        window.location.assign('/')
        return
      }
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        })
        if (error) throw error
        if (data.session) window.location.assign('/pending-access')
        else setMessage('Check your email to confirm the account. A practice owner must assign your practice before you can view its data.')
        return
      }
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/auth/update-password`,
      })
      if (error) throw error
      setMessage('If that email has an account, a password-reset link is on its way.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not complete the request. Please try again.')
    } finally { setBusy(false) }
  }

  const title = mode === 'login' ? 'Sign in to DentalOS' : mode === 'signup' ? 'Create your account' : 'Reset your password'
  return <section className="w-full max-w-md rounded-2xl border bg-card p-7 shadow-sm">
    <div className="mb-7">
      <div className="mb-5 text-xl font-semibold tracking-tight">dental<span className="font-normal text-muted-foreground">os</span><span className="text-primary">.</span></div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{mode === 'signup' ? 'New accounts need email confirmation and practice approval before they can see any practice data.' : mode === 'reset' ? 'We will email a one-time reset link if this account exists.' : 'Use your verified practice account to open your workspace.'}</p>
    </div>
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm font-medium" htmlFor="auth-email">Email
        <input id="auth-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-ring" />
      </label>
      {mode !== 'reset' && <label className="block text-sm font-medium" htmlFor="auth-password">Password
        <input id="auth-password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'signup' ? 12 : undefined} required value={password} onChange={e => setPassword(e.target.value)} className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-ring" />
        {mode === 'signup' && <span className="mt-1 block text-xs font-normal text-muted-foreground">Use at least 12 characters.</span>}
      </label>}
      {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="rounded-lg bg-muted p-3 text-sm leading-5">{message}</p>}
      <button disabled={busy} className="h-11 w-full rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}</button>
    </form>
    <div className="mt-5 flex flex-wrap justify-between gap-3 text-sm">
      {mode === 'login' ? <><Link className="text-primary underline-offset-4 hover:underline" href="/signup">Create account</Link><button onClick={() => { setMode('reset'); setError(''); setMessage('') }} className="text-muted-foreground underline-offset-4 hover:underline">Forgot password?</button></> : <button onClick={() => { setMode('login'); setError(''); setMessage('') }} className="text-primary underline-offset-4 hover:underline">Back to sign in</button>}
    </div>
    <p className="mt-6 border-t pt-4 text-xs leading-5 text-muted-foreground">Access is limited to the practice assigned to your account. Creating an account does not grant access by itself.</p>
  </section>
}

export function UpdatePasswordForm() {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const { error } = await createSupabaseBrowserClient().auth.updateUser({ password })
      if (error) throw error
      window.location.assign('/')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update the password.') }
    finally { setBusy(false) }
  }
  return <section className="w-full max-w-md rounded-2xl border bg-card p-7 shadow-sm">
    <h1 className="text-2xl font-semibold">Choose a new password</h1>
    <p className="mt-2 mb-6 text-sm text-muted-foreground">Use at least 12 characters.</p>
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm font-medium" htmlFor="new-password">New password<input id="new-password" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={e => setPassword(e.target.value)} className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal" /></label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <button disabled={busy} className="h-11 w-full rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">{busy ? 'Saving…' : 'Save password'}</button>
    </form>
  </section>
}
