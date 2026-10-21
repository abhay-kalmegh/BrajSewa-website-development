'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { CartNotices } from '@/components/cart-drawer'
import { useCart } from '@/lib/cart'
import { formatINR, formatRupees } from '@/lib/pricing'

export default function CartPage() {
  const { items, summary, syncing, updateQuantity, removeItem } = useCart()
  return (
    <main className="min-h-screen bg-[#fff9f0] px-5 py-10 text-[#24201d] lg:px-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="font-serif text-2xl">BrajSewa.com</Link>
        <h1 className="mt-12 font-serif text-5xl">Your cart</h1>
        <div className="mt-6"><CartNotices /></div>
        {items.length === 0 ? (
          <div className="mt-8 rounded-3xl bg-white p-10 text-center">
            <h2 className="font-serif text-3xl">Your cart is waiting</h2>
            <p className="mt-3 text-[#24201d]/60">Add something meaningful for your daily seva.</p>
            <Link href="/shop" className="mt-6 inline-flex rounded-full bg-[#d99a2b] px-6 py-3 font-bold text-white">Continue shopping</Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
            <section className="grid gap-3">
              {items.map((item) => (
                <article key={item.lineKey} className="flex gap-4 rounded-2xl bg-white p-4">
                  <Link href={`/shop/${item.id}`}>
                    <Image src={item.image} alt={item.name} width={96} height={96} sizes="96px" className="size-24 rounded-xl object-cover" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-serif text-2xl"><Link href={`/shop/${item.id}`}>{item.name}</Link></h2>
                    {item.options && Object.keys(item.options).length > 0 && (
                      <p className="mt-1 text-sm text-[#24201d]/60">{Object.entries(item.options).map(([key, value]) => `${key}: ${value}`).join(' · ')}</p>
                    )}
                    <p className="mt-1">{formatRupees(item.price)}</p>
                    <div className="mt-4 flex items-center gap-2">
                      <button type="button" onClick={() => updateQuantity(item.lineKey, item.quantity - 1)} aria-label={`Decrease ${item.name}`} className="grid size-8 place-items-center rounded-full border"><Minus className="size-4" /></button>
                      <span className="min-w-6 text-center">{item.quantity}</span>
                      <button type="button" onClick={() => updateQuantity(item.lineKey, item.quantity + 1)} aria-label={`Increase ${item.name}`}
                        disabled={item.maxQuantity !== undefined && item.quantity >= item.maxQuantity} className="grid size-8 place-items-center rounded-full border disabled:opacity-30"><Plus className="size-4" /></button>
                      <button type="button" onClick={() => removeItem(item.lineKey)} className="ml-3 text-sm font-bold text-[#d66a83]"><Trash2 className="inline size-4" /> Remove</button>
                    </div>
                    {item.maxQuantity !== undefined && item.maxQuantity <= 5 && <p className="mt-2 text-xs text-[#d66a83]">Only {item.maxQuantity} left</p>}
                  </div>
                  <strong>{formatRupees(item.price * item.quantity)}</strong>
                </article>
              ))}
            </section>
            <aside className="h-fit rounded-2xl bg-[#f3e4c9] p-6">
              <h2 className="font-serif text-3xl">Order summary</h2>
              <div className="mt-6 flex justify-between"><span>Subtotal</span><span>{formatINR(summary.subtotalPaise)}</span></div>
              <div className="mt-3 flex justify-between"><span>Shipping</span><span>{summary.shippingPaise ? formatINR(summary.shippingPaise) : 'FREE'}</span></div>
              <div className="my-5 flex justify-between border-t border-[#24201d]/10 pt-5 text-xl font-bold"><span>Total</span><span>{formatINR(summary.totalPaise)}</span></div>
              <Link href="/checkout" aria-disabled={syncing} className="flex justify-center rounded-full bg-[#d99a2b] px-5 py-4 font-bold text-white">Proceed to checkout</Link>
              <p className="mt-3 text-center text-xs text-[#24201d]/55">{syncing ? 'Updating prices…' : 'Prices and stock are confirmed at checkout.'}</p>
            </aside>
          </div>
        )}
      </div>
    </main>
  )
}
