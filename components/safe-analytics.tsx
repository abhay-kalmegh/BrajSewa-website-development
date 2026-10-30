'use client'

import { Analytics } from '@vercel/analytics/next'
import { usePathname } from 'next/navigation'
import { filterAnalyticsEvent, shouldTrack } from '@/lib/analytics-paths'

/**
 * Vercel Analytics on public pages only. It is not mounted when the customer lands on a sensitive page, and
 * `beforeSend` discards any event for one. A visitor who browsed public pages first already has the script loaded in
 * that tab; it can no longer report from /checkout, /account or /order, but it is still resident. The strongest option is
 * to drop third-party analytics entirely; the CSP in security-headers.mjs is the safety net.
 */
export function SafeAnalytics() {
  const pathname = usePathname()
  if (process.env.NODE_ENV !== 'production' || !shouldTrack(pathname)) return null
  return <Analytics beforeSend={filterAnalyticsEvent} />
}
