'use client'

import { useEffect } from 'react'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Keep production failures actionable without exposing server details to visitors.
    console.error('[v0] storefront route error', { digest: error.digest })
  }, [error.digest])

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-4xl items-center px-6 py-16">
      <div className="max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#b94a48]">A brief interruption</p>
        <h1 className="mt-5 font-serif text-5xl leading-tight text-[#24201d] md:text-7xl">The page needs another moment.</h1>
        <p className="mt-5 text-lg leading-8 text-[#635951]">Please try again. Your cart and account data are kept safely on the server.</p>
        <button type="button" onClick={() => reset()} className="mt-8 rounded-full bg-[#24201d] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#3d342f]">Try again</button>
      </div>
    </main>
  )
}
