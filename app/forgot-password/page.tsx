import type { Metadata } from 'next'
import { GenericPage } from '@/components/site-pages'

export const metadata: Metadata = { title: 'Reset your password | BrajSewa.com', robots: { index: false, follow: false } }
import { PasswordResetRequestForm } from '@/components/password-reset-forms'

export default function Page() {
  return <GenericPage eyebrow="Account security" title="Reset your password"><div className="mx-auto mt-8 max-w-xl rounded-2xl bg-white p-6 sm:p-8"><p className="text-sm leading-6 text-[#24201d]/70">Enter your account email. If it matches an account, we&apos;ll send a secure reset link.</p><PasswordResetRequestForm /></div></GenericPage>
}
