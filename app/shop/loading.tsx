export default function ShopLoading() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-16" aria-busy="true" aria-label="Loading shop">
      <div className="h-4 w-32 animate-pulse rounded-full bg-[#e9dfd2]" />
      <div className="mt-5 h-14 w-72 animate-pulse rounded-2xl bg-[#e9dfd2]" />
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => <div key={index} className="overflow-hidden rounded-3xl bg-white"><div className="aspect-square animate-pulse bg-[#f2e9df]" /><div className="space-y-3 p-5"><div className="h-4 w-3/4 animate-pulse rounded bg-[#e9dfd2]" /><div className="h-4 w-1/3 animate-pulse rounded bg-[#e9dfd2]" /></div></div>)}
      </div>
    </main>
  )
}
