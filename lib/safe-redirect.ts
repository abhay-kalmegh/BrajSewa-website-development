/**
 * Resolve a post-login destination (`?next=`), accepting only paths on OUR origin.
 *
 * Pattern-matching the string ("starts with /, not //") is not enough: browsers strip tab/CR/LF before parsing, so
 * "/<TAB>/evil.com" is really "//evil.com". We therefore resolve it the way the browser will and compare origins.
 * One more trap: "/.//evil.com" stays on our origin but normalises to the PATH "//evil.com", which a router treats
 * as an external URL, so a result that starts with "//" is rejected too.
 */
export function safeNext(raw: string | null | undefined, origin: string, fallback = '/shop'): string {
  if (!raw) return fallback
  try {
    const url = new URL(raw, origin)
    if (url.origin !== origin) return fallback
    const path = url.pathname + url.search + url.hash
    return path.startsWith('//') ? fallback : path
  } catch {
    return fallback
  }
}
