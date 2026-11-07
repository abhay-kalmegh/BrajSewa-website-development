const MAX_REPORT_BYTES = 32 * 1024

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > MAX_REPORT_BYTES) return new Response(null, { status: 413 })

  const report = await request.text()
  if (new TextEncoder().encode(report).byteLength > MAX_REPORT_BYTES) {
    return new Response(null, { status: 413 })
  }

  if (report) {
    console.warn('[csp-report]', report.slice(0, MAX_REPORT_BYTES))
  }

  return new Response(null, { status: 204 })
}
