export default function CheckoutLoading() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-16" aria-busy="true" aria-label="Loading checkout">
      <div className="h-4 w-28 animate-pulse rounded-full bg-[#e9dfd2]" />
      <div className="mt-5 h-14 w-80 animate-pulse rounded-2xl bg-[#e9dfd2]" />
      <div className="mt-10 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]"><div className="h-96 animate-pulse rounded-3xl bg-white" /><div className="h-80 animate-pulse rounded-3xl bg-[#f2e9df]" /></div>
    </main>
  )
}
