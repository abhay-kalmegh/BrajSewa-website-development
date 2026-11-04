import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-4xl items-center px-6 py-16">
      <div className="max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#667a52]">BrajSewa.com</p>
        <h1 className="mt-5 font-serif text-5xl leading-tight text-[#24201d] md:text-7xl">This page has wandered off.</h1>
        <p className="mt-5 max-w-md text-lg leading-8 text-[#635951]">The page you are looking for is not available, but the path to a thoughtful gift is still open.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/" className="rounded-full bg-[#24201d] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#3d342f]">Return home</Link>
          <Link href="/shop" className="rounded-full border border-[#24201d]/15 px-6 py-3 text-sm font-semibold text-[#24201d] transition hover:bg-[#fffaf2]">Browse the shop</Link>
        </div>
      </div>
    </main>
  )
}
