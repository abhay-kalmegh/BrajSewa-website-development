'use client'

import { useEffect, useState } from 'react'
import { API_REQUEST_STATUS_EVENT } from '@/lib/api'

export function ApiStatusBanner() {
  const [activeSlowRequests, setActiveSlowRequests] = useState(0)

  useEffect(() => {
    const updateCount = (event: Event) => {
      const detail = (event as CustomEvent<{ activeCount?: number }>).detail
      setActiveSlowRequests(detail?.activeCount ?? 0)
    }

    window.addEventListener(API_REQUEST_STATUS_EVENT, updateCount)
    return () => window.removeEventListener(API_REQUEST_STATUS_EVENT, updateCount)
  }, [])

  if (activeSlowRequests === 0) return null

  return (
    <div role="status" aria-live="polite" className="fixed inset-x-0 top-0 z-[100] border-b border-[#d99a2b]/30 bg-[#fff4d9] px-4 py-3 text-center text-sm font-medium text-[#59451f] shadow-sm">
      Server is waking up, please wait…
    </div>
  )
}
