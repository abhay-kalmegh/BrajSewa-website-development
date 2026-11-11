import type { Metadata } from 'next'
import { Suspense } from 'react'
import { EmailVerificationForm } from '@/components/email-verification-form'
import { GenericPage } from '@/components/site-pages'

export const metadata: Metadata = { title: 'Verify your email | BrajSewa.com', robots: { index: false, follow: false } }

export default function Page() {
  return <GenericPage eyebrow="Account security" title="Verify your email"><div className="mx-auto mt-8 max-w-xl rounded-2xl bg-white p-6 sm:p-8"><p className="text-sm leading-6 text-[#24201d]/70">A verified email helps protect your account and is required before you can sign in.</p><Suspense fallback={<p className="mt-8 text-sm text-[#24201d]/70">Loading verification link…</p>}><EmailVerificationForm /></Suspense></div></GenericPage>
}
