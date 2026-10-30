'use client'

import Link from 'next/link'

/** Shown when a page can't load, e.g. the catalogue API is unreachable. */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#fff9f0] px-5 text-center text-[#24201d]">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d66a83]">Something went wrong</p>
        <h1 className="mt-3 font-serif text-5xl">We couldn&apos;t load this page.</h1>
        <p className="mt-4 text-[#24201d]/60">Please try again in a moment.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button onClick={reset} className="rounded-full bg-[#d99a2b] px-6 py-3 font-bold text-white">Try again</button>
          <Link href="/" className="rounded-full border border-[#24201d]/20 px-6 py-3 font-bold">Home</Link>
        </div>
      </div>
    </main>
  )
}
