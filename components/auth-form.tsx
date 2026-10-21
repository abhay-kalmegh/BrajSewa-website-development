'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApiError, login, register } from '@/lib/api/client'

const inputClass = 'rounded-xl border border-[#24201d]/15 bg-white px-4 py-3 font-normal outline-none focus:border-[#d99a2b]'

/** Only same-site relative paths, so `?next=` can't be used as an open redirect. */
function destinationAfterAuth() {
  const next = new URLSearchParams(window.location.search).get('next')
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/shop'
}

export function AuthForm({ register: isRegister = false }: { register?: boolean }) {
  const router = useRouter()
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
      } else {
        await login({ email: value('email'), password: String(form.get('password') ?? '') })
      }
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

  const fieldError = (name: string) => fieldErrors[name]?.[0]

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
      {isRegister && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-semibold">First name
            <input name="firstName" required autoComplete="given-name" className={inputClass} />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold">Last name
            <input name="lastName" autoComplete="family-name" className={inputClass} />
          </label>
        </div>
      )}
      <label className="flex flex-col gap-2 text-sm font-semibold">Email
        <input name="email" type="email" required autoComplete="email" className={inputClass} />
        {fieldError('email') && <span className="text-xs font-normal text-[#d66a83]">{fieldError('email')}</span>}
      </label>
      {isRegister && (
        <label className="flex flex-col gap-2 text-sm font-semibold">Mobile number
          <input name="phone" type="tel" autoComplete="tel" className={inputClass} />
        </label>
      )}
      <label className="flex flex-col gap-2 text-sm font-semibold">Password
        <input name="password" type="password" required minLength={isRegister ? 8 : undefined}
          autoComplete={isRegister ? 'new-password' : 'current-password'} className={inputClass} />
        {fieldErrors.password?.map((message) => (
          <span key={message} className="text-xs font-normal text-[#d66a83]">{message}</span>
        ))}
      </label>
      {error && <p role="alert" className="rounded-xl bg-[#d66a83]/10 px-4 py-3 text-sm text-[#a43a52]">{error}</p>}
      <button type="submit" disabled={pending}
        className="rounded-full bg-[#d99a2b] px-5 py-4 text-sm font-bold text-white disabled:opacity-60">
        {pending ? 'Please wait…' : isRegister ? 'Create Account' : 'Login'}
      </button>
    </form>
  )
}
