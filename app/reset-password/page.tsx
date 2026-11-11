import type { Metadata } from 'next'
import { Suspense } from 'react'

export const metadata: Metadata = { title: 'Choose a new password | BrajSewa.com', robots: { index: false, follow: false } }
import { GenericPage } from '@/components/site-pages'
import { PasswordResetConfirmForm } from '@/components/password-reset-forms'

export default function Page() {
  return <GenericPage eyebrow="Account security" title="Choose a new password"><div className="mx-auto mt-8 max-w-xl rounded-2xl bg-white p-6 sm:p-8"><Suspense fallback={<p className="text-sm text-[#24201d]/70">Loading reset link…</p>}><PasswordResetConfirmForm /></Suspense></div></GenericPage>
}
