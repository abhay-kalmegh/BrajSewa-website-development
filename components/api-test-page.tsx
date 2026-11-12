'use client'

import useSWR from 'swr'
import { ApiError, api } from '@/lib/api'
import type { BackendDiagnostics, BackendProbe } from '@/lib/api/diagnostics'

type Measured<T> = {
  value: T | null
  status: number | null
  responseTimeMs: number
  detail: string
}

type ApiTestResult = {
  ok: boolean
  liveness: BackendProbe
  readiness: BackendProbe
  products: BackendProbe & { productCount: number | null }
}

async function measure<T>(request: () => Promise<T>): Promise<Measured<T>> {
  const startedAt = performance.now()
  try {
    return { value: await request(), status: 200, responseTimeMs: Math.round(performance.now() - startedAt), detail: 'Responding.' }
  } catch (error) {
    return {
      value: null,
      status: error instanceof ApiError ? error.status : null,
      responseTimeMs: Math.round(performance.now() - startedAt),
      detail: error instanceof Error ? error.message : 'The request could not be completed.',
    }
  }
}

function productCount(result: unknown) {
  if (Array.isArray(result)) return result.length
  return result !== null && typeof result === 'object' && 'count' in result && typeof result.count === 'number'
    ? result.count
    : null
}

async function checkBackend(): Promise<ApiTestResult> {
  const [health, catalog] = await Promise.all([
    measure(() => api<BackendDiagnostics>('/api/health/backend')),
    measure(() => api<unknown>('/api/proxy/products/')),
  ])
  const unavailable = (result: Measured<unknown>): BackendProbe => ({
    ok: false,
    status: result.status,
    responseTimeMs: result.responseTimeMs,
    detail: result.detail,
  })
  const liveness = health.value?.checks.liveness ?? unavailable(health)
  const readiness = health.value?.checks.readiness ?? unavailable(health)
  const products: BackendProbe & { productCount: number | null } = {
    ok: catalog.value !== null,
    status: catalog.status,
    responseTimeMs: catalog.responseTimeMs,
    detail: catalog.value === null ? catalog.detail : 'The existing products endpoint responded.',
    productCount: catalog.value === null ? null : productCount(catalog.value),
  }

  return { ok: liveness.ok && readiness.ok && products.ok, liveness, readiness, products }
}

export function ApiTestPage() {
  const { data, error, isLoading, isValidating, mutate } = useSWR<ApiTestResult>('backend-connection-test', checkBackend, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })

  const errorMessage = error instanceof Error ? error.message : 'Diagnostics could not be completed.'

  return (
    <main className="min-h-[70vh] bg-[#fff9f0] px-5 py-16 text-[#24201d]">
      <div className="mx-auto max-w-4xl">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#667a52]">Developer diagnostics</p>
        <h1 className="mt-3 font-serif text-5xl tracking-tight">Backend connection</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[#635951]">
          Checks the existing Django liveness, database readiness, and public products routes through the same-origin API proxy.
        </p>

        <section className="mt-8 rounded-3xl border border-[#24201d]/10 bg-white p-6 shadow-sm" aria-live="polite" aria-busy={isValidating}>
          {isLoading && (
            <div className="space-y-4" aria-busy="true" aria-label="Checking backend connection">
              <div className="h-5 w-40 animate-pulse rounded bg-[#e9dfd2]" />
              <div className="h-4 w-64 animate-pulse rounded bg-[#f2e9df]" />
            </div>
          )}

          {data && (
            <>
              <p className={`text-lg font-semibold ${data.ok ? 'text-[#38603b]' : 'text-[#a43a52]'}`}>
                {data.ok ? 'All checks passed' : 'Some checks need attention'}
              </p>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <CheckCard title="Backend liveness" check={data.liveness} />
                <CheckCard title="Database readiness" check={data.readiness} />
                <CheckCard
                  title="Products endpoint"
                  check={data.products}
                  extra={data.products.productCount === null ? undefined : `Products returned: ${data.products.productCount}`}
                />
              </div>
              {data.products.productCount === 0 && (
                <p className="mt-4 rounded-xl bg-[#fff9f0] p-3 text-sm text-[#635951]">
                  The API is reachable, but the catalog is currently empty.
                </p>
              )}
            </>
          )}

          {error && (
            <div role="alert">
              <p className="font-semibold text-[#a43a52]">Diagnostics failed</p>
              <p className="mt-2 break-words text-sm leading-6 text-[#635951]">{errorMessage}</p>
            </div>
          )}

          <button type="button" onClick={() => void mutate()} disabled={isValidating}
            className="mt-6 rounded-full bg-[#667a52] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#526543] disabled:cursor-wait disabled:opacity-60">
            {isValidating ? 'Checking…' : data && !data.ok ? 'Retry failed checks' : 'Check again'}
          </button>
        </section>
      </div>
    </main>
  )
}

function CheckCard({ title, check, extra }: { title: string; check: BackendProbe; extra?: string }) {
  return (
    <article className="rounded-2xl bg-[#fff9f0] p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        <span className={`text-xs font-bold uppercase tracking-wide ${check.ok ? 'text-[#38603b]' : 'text-[#a43a52]'}`}>
          {check.ok ? 'Ready' : 'Unavailable'}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-[#635951]">HTTP status</dt>
          <dd className="mt-1 font-semibold">{check.status ?? 'No response'}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-[#635951]">Response time</dt>
          <dd className="mt-1 font-semibold">{check.responseTimeMs} ms</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-[#635951]">{check.detail}</p>
      {extra && <p className="mt-2 text-sm font-semibold text-[#635951]">{extra}</p>}
    </article>
  )
}
