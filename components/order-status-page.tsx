'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { StatusBadge } from '@/components/order-card'
import { ApiError, getOrder } from '@/lib/api/client'
import { useRequireAuth } from '@/lib/auth'
import { formatDate, formatRupees, orderNumber } from '@/lib/pricing'
import type { OrderView } from '@/lib/types'

const POLL_EVERY_MS = 2500
const MAX_POLLS = 24 // about a minute: the Razorpay webhook normally lands within seconds

export function OrderStatusPage({ id }: { id: string }) {
  const { user } = useRequireAuth()
  const [order, setOrder] = useState<OrderView | null>(null)
  const [problem, setProblem] = useState<'notfound' | 'unavailable' | null>(null)
  const [gaveUp, setGaveUp] = useState(false)
  const [checkAgain, setCheckAgain] = useState(0)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    let timer: number | undefined
    let polls = 0
    setGaveUp(false)
    async function load() {
      try {
        const current = await getOrder(id)
        if (cancelled) return
        setOrder(current)
        setProblem(null)
        // The payment can be confirmed by the webhook a moment after the customer returns, so keep checking.
        if (current.status === 'pending') {
          if (++polls < MAX_POLLS) timer = window.setTimeout(load, POLL_EVERY_MS)
          else setGaveUp(true)
        }
      } catch (error) {
        if (cancelled) return
        if (error instanceof ApiError && error.status === 404) setProblem('notfound')
        else if (++polls < MAX_POLLS) timer = window.setTimeout(load, POLL_EVERY_MS)
        else setProblem('unavailable')
      }
    }
    void load()
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [id, user, checkAgain])

  return (
    <main className="min-h-screen bg-[#fff9f0] px-5 py-10 text-[#24201d] lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="font-serif text-2xl">BrajSewa.com</Link>
        <div className="mt-10">
          {problem === 'notfound' ? <Message title="Order not found" body="We couldn't find that order on your account." />
            : problem === 'unavailable' ? <Message title="We couldn't load your order" body="Please check your connection and try again." action={<button onClick={() => { setProblem(null); setCheckAgain((n) => n + 1) }} className="mt-5 rounded-full bg-[#d99a2b] px-6 py-3 font-bold text-white">Try again</button>} />
            : !order ? <p className="text-[#24201d]/60">Loading your order…</p>
            : <OrderBody order={order} gaveUp={gaveUp} onCheckAgain={() => setCheckAgain((n) => n + 1)} />}
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
