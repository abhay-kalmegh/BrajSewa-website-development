export default function HomeLoading() {
  return (
    <main className="min-h-screen bg-[#fff9f0] px-5 py-12" aria-busy="true" aria-label="Loading BrajSewa">
      <div className="mx-auto max-w-7xl">
        <div className="h-4 w-48 animate-pulse rounded bg-[#e9dfd2]" />
        <div className="mt-10 h-[min(48vh,28rem)] animate-pulse rounded-[2rem] bg-[#f2e9df]" />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-64 animate-pulse rounded-3xl bg-white" />)}
        </div>
        <p className="sr-only" role="status">Loading live products and availability.</p>
      </div>
    </main>
  )
}
