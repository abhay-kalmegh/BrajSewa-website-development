'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ApiError, confirmPasswordReset, requestPasswordReset } from '@/lib/api/client'

const inputClass = 'rounded-xl border border-[#24201d]/15 bg-white px-4 py-3 font-normal outline-none focus:border-[#d99a2b]'

export function PasswordResetRequestForm() {
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError('')
    setFieldErrors({})
    try {
      const form = new FormData(event.currentTarget)
      const result = await requestPasswordReset(String(form.get('email') ?? '').trim())
      setMessage(result.detail)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Password reset is temporarily unavailable.')
      if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors)
    } finally {
      setPending(false)
    }
  }

  return <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
    <label className="flex flex-col gap-2 text-sm font-semibold">Email address
      <input name="email" type="email" required maxLength={254} autoComplete="email" aria-invalid={Boolean(fieldErrors.email)} className={inputClass} />
      {fieldErrors.email?.map((message) => <span key={message} className="text-xs font-normal text-[#a43a52]">{message}</span>)}
    </label>
    {error && <p role="alert" className="rounded-xl bg-[#d66a83]/10 px-4 py-3 text-sm text-[#a43a52]">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-[#667a52]/10 px-4 py-3 text-sm text-[#43583a]">{message}</p>}
    <button type="submit" disabled={pending} className="rounded-full bg-[#d99a2b] px-5 py-4 text-sm font-bold text-white disabled:opacity-60">{pending ? 'Sending…' : 'Send reset link'}</button>
    <Link href="/login" className="text-center text-sm font-semibold text-[#667a52]">Back to login</Link>
  </form>
}

export function PasswordResetConfirmForm() {
  const router = useRouter()
  const params = useSearchParams()
  const uid = params.get('uid') ?? ''
  const token = params.get('token') ?? ''
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [success, setSuccess] = useState(false)
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password') ?? '')
    if (password !== String(form.get('confirmPassword') ?? '')) {
      setError('The passwords do not match.')
      return
    }
    setPending(true)
    setError('')
    setFieldErrors({})
    try {
      await confirmPasswordReset({ uid, token, password })
      setSuccess(true)
      router.replace('/login?passwordReset=1')
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Password reset is temporarily unavailable.')
      if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors)
    } finally {
      setPending(false)
    }
  }

  if (success) return <p role="status" className="mt-8 rounded-xl bg-[#667a52]/10 px-4 py-3 text-sm text-[#43583a]">Your password has been reset. Redirecting you to login…</p>
  if (!uid || !token) return <p role="alert" className="mt-8 rounded-xl bg-[#d66a83]/10 px-4 py-3 text-sm text-[#a43a52]">This password reset link is invalid or incomplete.</p>

  return <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
    <label className="flex flex-col gap-2 text-sm font-semibold">New password
      <input name="password" type="password" required minLength={8} maxLength={256} autoComplete="new-password" aria-invalid={Boolean(fieldErrors.password)} className={inputClass} />
      {fieldErrors.password?.map((message) => <span key={message} className="text-xs font-normal text-[#a43a52]">{message}</span>)}
    </label>
    <label className="flex flex-col gap-2 text-sm font-semibold">Confirm new password
      <input name="confirmPassword" type="password" required minLength={8} maxLength={256} autoComplete="new-password" className={inputClass} />
    </label>
    {error && <p role="alert" className="rounded-xl bg-[#d66a83]/10 px-4 py-3 text-sm text-[#a43a52]">{error}</p>}
    <button type="submit" disabled={pending} className="rounded-full bg-[#d99a2b] px-5 py-4 text-sm font-bold text-white disabled:opacity-60">{pending ? 'Updating…' : 'Update password'}</button>
  </form>
}
