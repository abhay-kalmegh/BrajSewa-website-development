'use client'

import Link from 'next/link'
import Image from 'next/image'
import Script from 'next/script'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { CartNotices } from '@/components/cart-drawer'
import { ApiError, createCheckoutOrder, verifyPayment, type CreateOrderResponse } from '@/lib/api/client'
import { useRequireAuth } from '@/lib/auth'
import { useCart } from '@/lib/cart'
import { formatINR, formatRupees, orderNumber } from '@/lib/pricing'

const inputClass = 'rounded-xl border border-[#24201d]/15 bg-white px-4 py-3 font-normal outline-none focus:border-[#d99a2b]'
type Stage = 'idle' | 'creating' | 'paying' | 'confirming'
const EMPTY = { firstName: '', lastName: '', email: '', phone: '', address: '', city: '', state: '', postalCode: '' }

export function CheckoutPage() {
  const router = useRouter()
  const { user, status } = useRequireAuth()
  const { items, summary, syncing, clear } = useCart()
  const [form, setForm] = useState(EMPTY)
  const [saveAddress, setSaveAddress] = useState(true)
  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [scriptReady, setScriptReady] = useState(false)
  const prefilled = useRef(false)

  // Prefill once from the saved profile/address.
  useEffect(() => {
    if (!user || prefilled.current) return
    prefilled.current = true
    setForm({
      firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone,
      address: user.address?.address ?? '', city: user.address?.city ?? '',
      state: user.address?.state ?? '', postalCode: user.address?.postalCode ?? '',
    })
    setSaveAddress(!user.address)
  }, [user])

  // Razorpay may already be loaded if the customer visited checkout before.
  useEffect(() => { if (window.Razorpay) setScriptReady(true) }, [])

  const set = (field: keyof typeof EMPTY) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((current) => ({ ...current, [field]: event.target.value }))

  function openRazorpay(order: CreateOrderResponse) {
    const Razorpay = window.Razorpay
    if (!Razorpay) throw new Error('The payment form is still loading. Please try again in a moment.')
    if (order.amount !== summary.totalPaise) {
      setInfo(`Your total is ${formatINR(order.amount)} (prices or delivery changed since you added items).`)
    }
    const checkout = new Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      order_id: order.razorpayOrderId,
      name: 'BrajSewa.com',
      description: `Order ${orderNumber(order.orderId)}`,
      image: '/icon-192.png',
      prefill: { name: `${form.firstName} ${form.lastName}`.trim(), email: form.email, contact: form.phone },
      notes: { order_id: order.orderId },
      theme: { color: '#d99a2b' },
      handler: async (response) => {
        // Money has been taken. Verify with our server (checks the signature), then show the order.
        // If this call fails (network drop), the Razorpay webhook still marks the order paid and the
        // order page keeps checking, so we continue either way.
        setStage('confirming')
        try { await verifyPayment(response) } catch { /* webhook is the backstop */ }
        clear()
        router.push(`/order/${order.orderId}`)
      },
      modal: {
        ondismiss: () => {
          setStage('idle')
          setInfo('Payment window closed. Your items are held for 30 minutes, so you can pay when you are ready.')
        },
      },
    })
    checkout.on('payment.failed', (failure) => {
      setError(failure.error?.description ?? 'The payment did not go through. You can try again.')
    })
    setStage('paying')
    checkout.open()
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (stage !== 'idle' || items.length === 0) return
    setError('')
    setInfo('')
    setStage('creating')
    try {
      const order = await createCheckoutOrder({
        customer: { ...form, lastName: form.lastName || undefined },
        lines: items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
        saveAddress,
      })
      openRazorpay(order)
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) { router.replace('/login?next=/checkout'); return }
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Please try again.')
      setStage('idle')
    }
  }

  const busy = stage !== 'idle'

  if (status === 'loading' || !user) {
    return <Shell><p className="mt-10 text-[#24201d]/60">Loading your checkout…</p></Shell>
  }
  if (stage === 'confirming') {
    return <Shell><div className="mt-10 rounded-3xl bg-white p-10 text-center"><h2 className="font-serif text-3xl">Confirming your payment…</h2><p className="mt-3 text-[#24201d]/60">Please don&apos;t close this page.</p></div></Shell>
  }
  if (items.length === 0) {
    return (
      <Shell>
        <div className="mt-10 rounded-3xl bg-white p-10 text-center">
          <h2 className="font-serif text-3xl">Your cart is empty</h2>
          <p className="mt-3 text-[#24201d]/60">Add something to your cart to check out.</p>
          <Link href="/shop" className="mt-6 inline-flex rounded-full bg-[#d99a2b] px-6 py-3 font-bold text-white">Continue shopping</Link>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" onLoad={() => setScriptReady(true)} />
      <div className="mt-6"><CartNotices /></div>
      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]">
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <h2 className="font-serif text-2xl">Contact information</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm font-semibold">Email
              <input required type="email" autoComplete="email" value={form.email} onChange={set('email')} className={inputClass} /></label>
            <label className="flex flex-col gap-2 text-sm font-semibold">Mobile number
              <input required type="tel" inputMode="tel" autoComplete="tel" pattern="[0-9+\s\-]{10,15}" title="Enter a valid mobile number"
                value={form.phone} onChange={set('phone')} className={inputClass} /></label>
          </div>
          <h2 className="mt-2 font-serif text-2xl">Delivery address</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm font-semibold">First name
              <input required autoComplete="given-name" value={form.firstName} onChange={set('firstName')} className={inputClass} /></label>
            <label className="flex flex-col gap-2 text-sm font-semibold">Last name
              <input autoComplete="family-name" value={form.lastName} onChange={set('lastName')} className={inputClass} /></label>
          </div>
          <label className="flex flex-col gap-2 text-sm font-semibold">Address
            <textarea required rows={3} autoComplete="street-address" value={form.address} onChange={set('address')} className={`${inputClass} resize-none`} /></label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-2 text-sm font-semibold">City
              <input required autoComplete="address-level2" value={form.city} onChange={set('city')} className={inputClass} /></label>
            <label className="flex flex-col gap-2 text-sm font-semibold">State
              <input required autoComplete="address-level1" value={form.state} onChange={set('state')} className={inputClass} /></label>
            <label className="flex flex-col gap-2 text-sm font-semibold">PIN code
              <input required inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{6}" maxLength={6} title="Enter a 6-digit PIN code"
                value={form.postalCode} onChange={set('postalCode')} className={inputClass} /></label>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={saveAddress} onChange={(event) => setSaveAddress(event.target.checked)} /> Save this address for next time</label>

          {error && <p role="alert" className="rounded-xl bg-[#d66a83]/10 px-4 py-3 text-sm text-[#a43a52]">{error}</p>}
          {info && <p role="status" className="rounded-xl bg-[#fff5de] px-4 py-3 text-sm">{info}</p>}

          <button type="submit" disabled={busy || syncing || !scriptReady}
            className="rounded-full bg-[#d99a2b] px-5 py-4 font-bold text-white disabled:opacity-60">
            {stage === 'creating' ? 'Preparing payment…' : stage === 'paying' ? 'Complete the payment in the window…'
              : !scriptReady ? 'Loading secure payment…' : `Pay ${formatINR(summary.totalPaise)} securely`}
          </button>
          <p className="text-center text-xs text-[#24201d]/55">Payments are processed by Razorpay (UPI, cards, netbanking, wallets). We never see your card details.</p>
        </form>

        <aside className="h-fit rounded-2xl bg-[#f3e4c9] p-6">
          <h2 className="font-serif text-3xl">Order summary</h2>
          <ul className="mt-5 grid gap-4">
            {items.map((item) => (
              <li key={item.lineKey} className="flex gap-3">
                <Image src={typeof item.image === 'string' && item.image.trim() ? item.image : '/brajsewa-logo.png'} alt="" width={56} height={56} sizes="56px" className="size-14 rounded-lg object-cover" />
                <div className="min-w-0 flex-1 text-sm"><p className="font-semibold">{item.name}</p><p className="text-[#24201d]/60">Qty {item.quantity}</p></div>
                <span className="text-sm font-semibold">{formatRupees(item.price * item.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex justify-between text-sm"><span>Subtotal</span><span>{formatINR(summary.subtotalPaise)}</span></div>
          <div className="mt-2 flex justify-between text-sm"><span>Shipping</span><span>{summary.shippingPaise ? formatINR(summary.shippingPaise) : 'FREE'}</span></div>
          <div className="mt-4 flex justify-between border-t border-[#24201d]/10 pt-4 text-xl font-bold"><span>Total</span><span>{formatINR(summary.totalPaise)}</span></div>
          <Link href="/cart" className="mt-5 block text-center text-sm font-semibold text-[#667a52] underline">Edit cart</Link>
        </aside>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#fff9f0] px-5 py-10 text-[#24201d] lg:px-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="font-serif text-2xl">BrajSewa.com</Link>
        <p className="mt-10 text-xs font-bold uppercase tracking-[0.2em] text-[#d66a83]">Secure checkout</p>
        <h1 className="mt-2 font-serif text-5xl">Complete your seva.</h1>
        {children}
      </div>
    </main>
  )
}
