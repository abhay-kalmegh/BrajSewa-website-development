const MAX_REPORT_BYTES = 32 * 1024

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? ''
  if (contentType && !['application/csp-report', 'application/reports+json', 'application/json'].some((allowed) => contentType.includes(allowed))) {
    return new Response(null, { status: 415, headers: { 'Cache-Control': 'no-store' } })
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > MAX_REPORT_BYTES) return new Response(null, { status: 413, headers: { 'Cache-Control': 'no-store' } })

  if (!request.body) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })

  const reader = request.body.getReader()
  let received = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > MAX_REPORT_BYTES) {
        await reader.cancel()
        return new Response(null, { status: 413, headers: { 'Cache-Control': 'no-store' } })
      }
    }
  } finally {
    reader.releaseLock()
  }

  console.info('[csp-report]', { contentType, bytes: received })
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}
