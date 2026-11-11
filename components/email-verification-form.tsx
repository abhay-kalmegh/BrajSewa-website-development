'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ApiError, confirmEmailVerification, resendEmailVerification } from '@/lib/api/client'

const inputClass = 'rounded-xl border border-[#24201d]/15 bg-white px-4 py-3 font-normal outline-none focus:border-[#d99a2b]'

export function EmailVerificationForm() {
  const params = useSearchParams()
  const uid = params.get('uid') ?? ''
  const token = params.get('token') ?? ''
  const email = params.get('email') ?? ''
  const [pending, setPending] = useState(false)
  const [verified, setVerified] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function verify() {
    if (pending || !uid || !token) return
    setPending(true)
    setError('')
    try {
      const result = await confirmEmailVerification({ uid, token })
      setVerified(true)
      setMessage(result.detail)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Email verification is temporarily unavailable.')
    } finally {
      setPending(false)
    }
  }

  async function resend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const form = new FormData(event.currentTarget)
    const address = String(form.get('email') ?? '').trim()
    setPending(true)
    setError('')
    setMessage('')
    try {
      const result = await resendEmailVerification(address)
      setMessage(result.detail)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Email verification is temporarily unavailable.')
    } finally {
      setPending(false)
    }
  }

  return <div className="mt-8 flex flex-col gap-5">
    {uid && token && !verified && <div className="rounded-2xl bg-[#fffaf2] p-5">
      <p className="text-sm leading-6 text-[#24201d]/70">Confirm the email address for this account to activate it.</p>
      <button type="button" onClick={verify} disabled={pending} className="mt-4 w-full rounded-full bg-[#d99a2b] px-5 py-4 text-sm font-bold text-white disabled:opacity-60">{pending ? 'Verifying…' : 'Verify email address'}</button>
    </div>}
    {error && <p role="alert" className="rounded-xl bg-[#d66a83]/10 px-4 py-3 text-sm text-[#a43a52]">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-[#667a52]/10 px-4 py-3 text-sm text-[#43583a]">{message}</p>}
    {verified ? <Link href="/login" className="rounded-full bg-[#d99a2b] px-5 py-4 text-center text-sm font-bold text-white">Continue to login</Link> : <form onSubmit={resend} className="flex flex-col gap-4">
      <p className="text-sm leading-6 text-[#24201d]/70">You can request a fresh link if you have not received one or the previous link expired.</p>
      <label className="flex flex-col gap-2 text-sm font-semibold">Email address
        <input key={email} name="email" type="email" required maxLength={254} autoComplete="email" defaultValue={email} className={inputClass} />
      </label>
      <button type="submit" disabled={pending} className="rounded-full border border-[#24201d]/15 bg-white px-5 py-4 text-sm font-bold text-[#43583a] disabled:opacity-60">{pending ? 'Sending…' : 'Resend verification link'}</button>
    </form>}
    <Link href="/login" className="text-center text-sm font-semibold text-[#667a52]">Back to login</Link>
  </div>
}
