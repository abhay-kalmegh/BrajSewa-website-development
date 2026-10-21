/**
 * One request id per incoming request, forwarded to Django and returned to the browser, so a customer's error report,
 * the Next.js log line and the Django log line can be joined. The incoming value is untrusted (it could contain newlines
 * to forge log lines), so it is length-limited and character-restricted; anything else is replaced.
 */
const SAFE = /^[A-Za-z0-9._-]{1,64}$/
const assigned = new WeakMap<object, string>()   // same id for every upstream call made while serving one request

export function ensureRequestId(incoming: string | null | undefined, generate: () => string = () => crypto.randomUUID()): string {
  return incoming && SAFE.test(incoming) ? incoming : generate()
}

export function requestIdFor(req: Request | undefined, generate?: () => string): string {
  if (!req) return ensureRequestId(undefined, generate)
  let id = assigned.get(req)
  if (!id) {
    id = ensureRequestId(req.headers.get('x-request-id'), generate)
    assigned.set(req, id)
  }
  return id
}
