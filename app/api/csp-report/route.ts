const MAX_REPORT_BYTES = 32 * 1024

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? ''
  if (contentType && !['application/csp-report', 'application/reports+json', 'application/json'].some((allowed) => contentType.includes(allowed))) {
    return new Response(null, { status: 415, headers: { 'Cache-Control': 'no-store' } })
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > MAX_REPORT_BYTES) return new Response(null, { status: 413, headers: { 'Cache-Control': 'no-store' } })

  const report = await request.text()
  if (new TextEncoder().encode(report).byteLength > MAX_REPORT_BYTES) {
    return new Response(null, { status: 413, headers: { 'Cache-Control': 'no-store' } })
  }

  if (report) {
    console.warn('[csp-report]', report.slice(0, MAX_REPORT_BYTES))
  }

  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}
