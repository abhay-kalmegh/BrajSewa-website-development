'use client'

import { use } from 'react'
import { OrderStatusPage } from '@/components/order-status-page'

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <OrderStatusPage id={id} />
}
