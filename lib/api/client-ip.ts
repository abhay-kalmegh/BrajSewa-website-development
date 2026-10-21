/**
 * Derive the real client IP from X-Forwarded-For when YOU control the last N proxies.
 *
 * Each proxy APPENDS the address it received the connection from, so the entries added by our own infrastructure
 * are the LAST `trustedHops` ones; everything before them was supplied by the client and can be forged.
 *
 *   browser (forges "6.6.6.6") -> CloudFront (appends viewer IP) -> ALB (appends CloudFront's IP) -> Next.js
 *   header seen by Next.js:  "6.6.6.6, <viewer-ip>, <cloudfront-ip>"   with TRUSTED_PROXY_HOPS=2
 *   the viewer IP is entry [length - 2]; the forged value is ignored.
 *
 * Returns '' when the header has fewer entries than there are trusted hops (something bypassed the proxies) or when
 * the configured hop count is not a positive integer: the caller then sends no address rather than a guess.
 */
export function clientIp(forwardedFor: string | null | undefined, trustedHops: number): string {
  if (!forwardedFor || !Number.isInteger(trustedHops) || trustedHops < 1) return ''
  const chain = forwardedFor.split(',').map((part) => part.trim()).filter(Boolean)
  if (chain.length < trustedHops) return ''
  const candidate = chain[chain.length - trustedHops]
  // Accept only something shaped like an IPv4/IPv6 address so a forged value can't carry arbitrary text onward.
  return /^[0-9a-fA-F:.]{3,45}$/.test(candidate) ? candidate : ''
}
