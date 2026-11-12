'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ApiError, register } from '@/lib/api/client'
import { useAuth } from '@/lib/auth'
import { safeNext } from '@/lib/safe-redirect'

const inputClass = 'rounded-xl border border-[#24201d]/15 bg-white px-4 py-3 font-normal outline-none focus:border-[#d99a2b]'

const destinationAfterAuth = () => safeNext(new URLSearchParams(window.location.search).get('next'), window.location.origin)

export function AuthForm({ register: isRegister = false }: { register?: boolean }) {
  const router = useRouter()
  const { login: signIn } = useAuth()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const form = new FormData(event.currentTarget)
    const value = (name: string) => String(form.get(name) ?? '').trim()
    setPending(true)
    setError('')
    setFieldErrors({})
    try {
      if (isRegister) {
        await register({
          email: value('email'),
          password: String(form.get('password') ?? ''),
          firstName: value('firstName'),
          lastName: value('lastName'),
          phone: value('phone'),
        })
        router.push(`/verify-email?email=${encodeURIComponent(value('email'))}`)
        router.refresh()
        return
      }
      // Load the new session first: that is what makes the header update and triggers the cart merge.
      await signIn({ email: value('email'), password: String(form.get('password') ?? '') })
      router.push(destinationAfterAuth())
      router.refresh()
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message)
        setFieldErrors(caught.fieldErrors)
      } else {
        setError('Something went wrong. Please try again.')
      }
      setPending(false)
    }
  }

  const fieldError = (name: string) => fieldErrors[name]?.[0] ?? fieldErrors[name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)]?.[0]

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
      {isRegister && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-semibold">First name
            <input name="firstName" required autoComplete="given-name" aria-invalid={Boolean(fieldError('firstName'))} className={inputClass} />
            {fieldError('firstName') && <span className="text-xs font-normal text-[#d66a83]">{fieldError('firstName')}</span>}
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold">Last name
            <input name="lastName" autoComplete="family-name" aria-invalid={Boolean(fieldError('lastName'))} className={inputClass} />
            {fieldError('lastName') && <span className="text-xs font-normal text-[#d66a83]">{fieldError('lastName')}</span>}
          </label>
        </div>
      )}
      <label className="flex flex-col gap-2 text-sm font-semibold">Email
        <input name="email" type="email" required autoComplete="email" aria-invalid={Boolean(fieldError('email'))} className={inputClass} />
        {fieldError('email') && <span className="text-xs font-normal text-[#d66a83]">{fieldError('email')}</span>}
      </label>
      {isRegister && (
        <label className="flex flex-col gap-2 text-sm font-semibold">Mobile number
          <input name="phone" type="tel" autoComplete="tel" aria-invalid={Boolean(fieldError('phone'))} className={inputClass} />
          {fieldError('phone') && <span className="text-xs font-normal text-[#d66a83]">{fieldError('phone')}</span>}
        </label>
      )}
      <label className="flex flex-col gap-2 text-sm font-semibold">Password
        <input name="password" type="password" required minLength={isRegister ? 8 : undefined}
          autoComplete={isRegister ? 'new-password' : 'current-password'} aria-invalid={Boolean(fieldError('password'))} className={inputClass} />
        {fieldErrors.password?.map((message) => (
          <span key={message} className="text-xs font-normal text-[#d66a83]">{message}</span>
        ))}
      </label>
      {!isRegister && <div className="-mt-2 flex justify-between gap-4 text-sm font-semibold text-[#667a52]"><Link href="/forgot-password">Forgot password?</Link><Link href="/verify-email">Verify email</Link></div>}
      {error && <p role="alert" className="rounded-xl bg-[#d66a83]/10 px-4 py-3 text-sm text-[#a43a52]">{error}</p>}
      <button type="submit" disabled={pending}
        className="rounded-full bg-[#d99a2b] px-5 py-4 text-sm font-bold text-white disabled:opacity-60">
        {pending ? 'Please wait…' : isRegister ? 'Create Account' : 'Login'}
      </button>
    </form>
  )
}
