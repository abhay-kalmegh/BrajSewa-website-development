import { backendFetch } from '@/lib/api/server'
import type { BackendDiagnostics, BackendProbe } from '@/lib/api/diagnostics'

export const dynamic = 'force-dynamic'

async function probe(path: '/healthz/' | '/readyz/', req: Request): Promise<BackendProbe> {
  const startedAt = performance.now()

  try {
    const response = await backendFetch(path, { req })
    return {
      ok: response.ok,
      status: response.status,
      responseTimeMs: Math.round(performance.now() - startedAt),
      detail: response.ok
        ? 'Responding.'
        : path === '/readyz/' && response.status === 503
          ? 'The backend database is not ready.'
          : `The backend returned HTTP ${response.status}.`,
    }
  } catch (error) {
    return {
      ok: false,
      status: null,
      responseTimeMs: Math.round(performance.now() - startedAt),
      detail: error instanceof Error && error.name === 'TimeoutError'
        ? 'The backend probe timed out.'
        : 'The backend could not be reached.',
    }
  }
}

export async function GET(req: Request) {
  const [liveness, readiness] = await Promise.all([probe('/healthz/', req), probe('/readyz/', req)])
  const body: BackendDiagnostics = {
    ok: liveness.ok && readiness.ok,
    checks: { liveness, readiness },
  }

  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } })
}
