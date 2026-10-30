import Link from 'next/link'
import Image from 'next/image'
import { formatDate, formatRupees, orderNumber } from '@/lib/pricing'
import type { OrderStatus, OrderView } from '@/lib/types'

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Awaiting payment',
  paid: 'Paid',
  fulfilled: 'Shipped',
  failed: 'Payment failed',
  expired: 'Expired',
  cancelled: 'Cancelled',
}

const STATUS_STYLE: Record<OrderStatus, string> = {
  pending: 'bg-[#fff5de] text-[#8a6416]',
  paid: 'bg-[#e4eedb] text-[#4d6139]',
  fulfilled: 'bg-[#e4eedb] text-[#4d6139]',
  failed: 'bg-[#fbe4ea] text-[#a43a52]',
  expired: 'bg-[#eee7da] text-[#24201d]/70',
  cancelled: 'bg-[#eee7da] text-[#24201d]/70',
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>
}

export function OrderCard({ order }: { order: OrderView }) {
  return (
    <article className="rounded-2xl border border-[#24201d]/10 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-serif text-xl">{orderNumber(order.id)}</p>
          <p className="text-sm text-[#24201d]/55">Placed {formatDate(order.created_at)}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>
      <ul className="mt-4 grid gap-3">
        {order.lines.map((line) => (
          <li key={line.productId} className="flex items-center gap-3">
            {line.image && <Image src={line.image} alt="" width={48} height={48} sizes="48px" className="size-12 rounded-lg object-cover" />}
            <div className="min-w-0 flex-1 text-sm">
              <Link href={`/shop/${line.slug}`} className="font-semibold hover:text-[#667a52]">{line.name}</Link>
              <p className="text-[#24201d]/55">Qty {line.quantity} · {formatRupees(line.unitPrice)} each</p>
            </div>
            <span className="text-sm font-semibold">{formatRupees(line.unitPrice * line.quantity)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center justify-between border-t border-[#24201d]/10 pt-4">
        <span className="font-bold">Total {formatRupees(order.total)}</span>
        <Link href={`/order/${order.id}`} className="text-sm font-bold text-[#667a52] underline">View order</Link>
      </div>
    </article>
  )
}
