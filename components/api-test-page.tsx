'use client'

import useSWR from 'swr'
import { ApiError, api } from '@/lib/api'

 type BackendCheck = {
  status: number
  responseTimeMs: number
  productCount: number | null
}

async function checkBackend(): Promise<BackendCheck> {
  const startedAt = performance.now()
  const result = await api<unknown>('/api/v1/products/')
  const responseTimeMs = Math.round(performance.now() - startedAt)
  const productCount = Array.isArray(result)
    ? result.length
    : result !== null && typeof result === 'object' && 'count' in result && typeof result.count === 'number'
      ? result.count
      : null

  return { status: 200, responseTimeMs, productCount }
}

export function ApiTestPage() {
  const { data, error, isLoading, mutate } = useSWR<BackendCheck>('backend-connection-test', checkBackend, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })

  const errorMessage = error instanceof Error ? error.message : 'The backend could not be reached.'
  const statusCode = error instanceof ApiError ? error.status : null

  return (
    <main className="min-h-[70vh] bg-[#fff9f0] px-5 py-16 text-[#24201d]">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#667a52]">Developer diagnostics</p>
        <h1 className="mt-3 font-serif text-5xl tracking-tight">Backend connection</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[#635951]">
          This check requests the existing public products endpoint through the same-origin API proxy.
        </p>

        <section className="mt-8 rounded-3xl border border-[#24201d]/10 bg-white p-6 shadow-sm" aria-live="polite">
          {isLoading && (
            <div className="space-y-4" aria-busy="true" aria-label="Checking backend connection">
              <div className="h-5 w-40 animate-pulse rounded bg-[#e9dfd2]" />
              <div className="h-4 w-64 animate-pulse rounded bg-[#f2e9df]" />
            </div>
          )}

          {data && (
            <div>
              <p className="flex items-center gap-2 text-lg font-semibold text-[#38603b]">
                <span className="size-2.5 rounded-full bg-[#5f8a54]" aria-hidden="true" /> Backend connected
              </p>
              <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl bg-[#fff9f0] p-4">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-[#635951]">HTTP status</dt>
                  <dd className="mt-1 text-2xl font-semibold">{data.status}</dd>
                </div>
                <div className="rounded-2xl bg-[#fff9f0] p-4">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-[#635951]">Response time</dt>
                  <dd className="mt-1 text-2xl font-semibold">{data.responseTimeMs} ms</dd>
                </div>
              </dl>
              {data.productCount !== null && (
                <p className="mt-4 text-sm text-[#635951]">Products returned: {data.productCount}</p>
              )}
              {data.productCount === 0 && (
                <p className="mt-2 rounded-xl bg-[#fff9f0] p-3 text-sm text-[#635951]">The API is reachable, but the catalog is currently empty.</p>
              )}
            </div>
          )}

          {error && (
            <div>
              <p className="font-semibold text-[#a43a52]">Backend connection failed{statusCode ? ` (HTTP ${statusCode})` : ''}</p>
              <p className="mt-2 break-words text-sm leading-6 text-[#635951]">{errorMessage}</p>
            </div>
          )}

          <button type="button" onClick={() => void mutate()} disabled={isLoading}
            className="mt-6 rounded-full bg-[#667a52] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#526543] disabled:cursor-wait disabled:opacity-60">
            {isLoading ? 'Checking…' : error ? 'Retry connection' : 'Check again'}
          </button>
        </section>
      </div>
    </main>
  )
}
