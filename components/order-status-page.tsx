'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'
import useSWR from 'swr'
import { StatusBadge } from '@/components/order-card'
import { ApiError, getOrder } from '@/lib/api/client'
import { useRequireAuth } from '@/lib/auth'
import { formatDate, formatRupees, orderNumber } from '@/lib/pricing'
import type { OrderView } from '@/lib/types'

const POLL_EVERY_MS = 2500
const MAX_POLLS = 24 // about a minute: the Razorpay webhook normally lands within seconds

export function OrderStatusPage({ id }: { id: string }) {
  const { user, status, refresh } = useRequireAuth()
  const [polls, setPolls] = useState(0)
  const { data: order, error, mutate, isLoading } = useSWR<OrderView>(user ? `order-status-${id}` : null, () => getOrder(id), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
    refreshInterval: (current) => current?.status === 'pending' && polls < MAX_POLLS ? POLL_EVERY_MS : 0,
    onSuccess: (current) => {
      if (current.status === 'pending') setPolls((count) => Math.min(MAX_POLLS, count + 1))
    },
  })
  const problem = error instanceof ApiError && error.status === 404 ? 'notfound' : error ? 'unavailable' : null
  const gaveUp = Boolean(order?.status === 'pending' && polls >= MAX_POLLS)
  const checkAgain = () => {
    setPolls(0)
    void mutate()
  }

  if (status === 'error' && !user) {
    return <main className="min-h-screen bg-[#fff9f0] px-5 py-10 text-[#24201d]"><div className="mx-auto max-w-3xl"><Message title="We could not check your session" body="The server may be waking up. Please try again." action={<button type="button" onClick={() => void refresh()} className="mt-5 rounded-full bg-[#d99a2b] px-6 py-3 font-bold text-white">Try again</button>} /></div></main>
  }
  if (status === 'loading' || !user) {
    return <main className="min-h-screen bg-[#fff9f0] px-5 py-10 text-[#24201d]"><p role="status" className="mx-auto max-w-3xl">Checking your account…</p></main>
  }

  return (
    <main className="min-h-screen bg-[#fff9f0] px-5 py-10 text-[#24201d] lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="font-serif text-2xl">BrajSewa.com</Link>
        <div className="mt-10">
          {problem === 'notfound' ? <Message title="Order not found" body="We couldn't find that order on your account." />
            : problem === 'unavailable' ? <Message title="We couldn't load your order" body="Please check your connection and try again." action={<button type="button" onClick={checkAgain} className="mt-5 rounded-full bg-[#d99a2b] px-6 py-3 font-bold text-white">Try again</button>} />
            : !order ? isLoading ? <div role="status" aria-busy="true" aria-label="Loading your order" className="space-y-3"><div className="h-10 animate-pulse rounded-2xl bg-white" /><div className="h-24 animate-pulse rounded-2xl bg-white" /></div> : <p className="text-[#24201d]/60">No order details are available.</p>
            : <OrderBody order={order} gaveUp={gaveUp} onCheckAgain={checkAgain} />}
        </div>
      </div>
    </main>
  )
}

function Message({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return <div className="rounded-3xl bg-white p-10 text-center"><h1 className="font-serif text-4xl">{title}</h1><p className="mt-3 text-[#24201d]/60">{body}</p>{action}<div className="mt-6"><Link href="/account/orders" className="text-sm font-bold text-[#667a52] underline">Your orders</Link></div></div>
}

function OrderBody({ order, gaveUp, onCheckAgain }: { order: OrderView; gaveUp: boolean; onCheckAgain: () => void }) {
  const paid = order.status === 'paid' || order.status === 'fulfilled'
  const a = order.shippingAddress
  return (
    <>
      <div className="rounded-3xl bg-white p-8 text-center sm:p-10">
        {paid ? (
          <>
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-[#667a52] text-2xl text-white">✓</div>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-[#667a52]">Radhe Radhe</p>
            <h1 className="mt-2 font-serif text-4xl sm:text-5xl">Thank you. Your order is confirmed.</h1>
            <p className="mt-3 text-[#24201d]/60">Order {orderNumber(order.id)} · we&apos;ll deliver to the address below. You can find this order any time under Your orders.</p>
          </>
        ) : order.status === 'pending' ? (
          <>
            <h1 className="font-serif text-4xl">{gaveUp ? 'Still confirming your payment' : 'Confirming your payment…'}</h1>
            <p className="mt-3 text-[#24201d]/60">
              {gaveUp
                ? 'Your bank is taking longer than usual. If you were charged, your order will update automatically. If it doesn\'t within a few minutes, please contact us with your order number.'
                : 'This usually takes a few seconds. Please keep this page open.'}
            </p>
            {gaveUp && <button onClick={onCheckAgain} className="mt-5 rounded-full bg-[#d99a2b] px-6 py-3 font-bold text-white">Check again</button>}
          </>
        ) : (
          <>
            <h1 className="font-serif text-4xl">This order wasn&apos;t completed</h1>
            <p className="mt-3 text-[#24201d]/60">No payment was taken for {orderNumber(order.id)}. If you were charged, please contact us and we&apos;ll sort it out.</p>
            <Link href="/cart" className="mt-5 inline-flex rounded-full bg-[#d99a2b] px-6 py-3 font-bold text-white">Back to your cart</Link>
          </>
        )}
      </div>

      <section className="mt-6 rounded-2xl bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-2xl">Order details</h2><StatusBadge status={order.status} /></div>
        <p className="mt-1 text-sm text-[#24201d]/55">Placed {formatDate(order.created_at)}</p>
        <ul className="mt-5 grid gap-4">
          {order.lines.map((line) => (
            <li key={line.productId} className="flex items-center gap-3">
              {line.image && <Image src={line.image} alt="" width={56} height={56} sizes="56px" className="size-14 rounded-lg object-cover" />}
              <div className="min-w-0 flex-1 text-sm"><Link href={`/shop/${line.slug}`} className="font-semibold">{line.name}</Link><p className="text-[#24201d]/55">Qty {line.quantity}</p></div>
              <span className="text-sm font-semibold">{formatRupees(line.unitPrice * line.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 grid gap-2 border-t border-[#24201d]/10 pt-4 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatRupees(order.subtotal)}</span></div>
          <div className="flex justify-between"><span>Shipping</span><span>{order.shipping ? formatRupees(order.shipping) : 'FREE'}</span></div>
          <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{formatRupees(order.total)}</span></div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl bg-white p-6">
        <h2 className="font-serif text-2xl">Delivering to</h2>
        <p className="mt-3 text-sm leading-6">{a.name}<br />{a.address}<br />{a.city}, {a.state} {a.postalCode}<br />{a.phone}</p>
      </section>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/shop" className="rounded-full bg-[#d99a2b] px-6 py-3 font-bold text-white">Continue shopping</Link>
        <Link href="/account/orders" className="rounded-full border border-[#24201d]/20 px-6 py-3 font-bold">Your orders</Link>
      </div>
    </>
  )
}
