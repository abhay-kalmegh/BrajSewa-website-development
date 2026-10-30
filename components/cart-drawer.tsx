'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Minus, Plus, ShoppingBag, X } from 'lucide-react'
import { useCart } from '@/lib/cart'
import { formatINR, formatRupees } from '@/lib/pricing'

export function CartNotices() {
  const { notices, dismissNotices } = useCart()
  if (!notices.length) return null
  return (
    <div role="status" className="rounded-xl bg-[#fff5de] p-4 text-sm text-[#24201d]/80">
      <ul className="grid gap-1">{notices.map((notice) => <li key={notice}>{notice}</li>)}</ul>
      <button type="button" onClick={dismissNotices} className="mt-2 text-xs font-bold text-[#667a52] underline">Dismiss</button>
    </div>
  )
}

/** Slide-in cart used on the home page. Same cart (and server sync) as the /cart page. */
export function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items, summary, updateQuantity, removeItem } = useCart()
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 bg-[#24201d]/30" onClick={onClose}>
      <aside onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Your seva cart"
        className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-[#fff9f0] p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#667a52]">Your cart</p>
            <h2 className="mt-1 font-serif text-3xl">Your seva cart</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-[#f3e9d8]" aria-label="Close cart"><X /></button>
        </div>
        <div className="mt-6"><CartNotices /></div>
        <div className="mt-6 flex-1 overflow-auto">
          {items.length === 0 ? (
            <div className="grid h-full place-items-center text-center">
              <div>
                <ShoppingBag className="mx-auto size-10 text-[#d99a2b]" />
                <p className="mt-4 font-serif text-2xl">Your cart is waiting.</p>
                <p className="mt-2 text-sm text-[#24201d]/55">Add something meaningful to begin.</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {items.map((item) => (
                <div key={item.lineKey} className="flex gap-3 rounded-xl bg-white p-3">
                  <Image src={item.image} alt="" width={64} height={64} sizes="64px" className="size-16 rounded-lg object-cover" />
                  <div className="flex-1">
                    <p className="font-serif text-lg">{item.name}</p>
                    <p className="text-sm text-[#667a52]">{formatRupees(item.price)} each</p>
                    <div className="mt-2 inline-flex items-center rounded-full border border-[#24201d]/10">
                      <button onClick={() => updateQuantity(item.lineKey, item.quantity - 1)} className="grid size-7 place-items-center" aria-label={`Decrease ${item.name}`}><Minus className="size-3" /></button>
                      <span className="w-6 text-center text-xs font-semibold">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.lineKey, item.quantity + 1)} disabled={item.maxQuantity !== undefined && item.quantity >= item.maxQuantity}
                        className="grid size-7 place-items-center disabled:opacity-30" aria-label={`Increase ${item.name}`}><Plus className="size-3" /></button>
                    </div>
                  </div>
                  <button onClick={() => removeItem(item.lineKey)} className="self-start text-[#24201d]/40 hover:text-[#d66a83]" aria-label={`Remove ${item.name}`}><X className="size-4" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
        {items.length > 0 && (
          <div className="border-t border-[#24201d]/10 pt-5">
            <div className="flex justify-between text-sm"><span>Subtotal</span><span>{formatINR(summary.subtotalPaise)}</span></div>
            <div className="mt-2 flex justify-between text-sm"><span>Shipping</span><span>{summary.shippingPaise ? formatINR(summary.shippingPaise) : 'FREE'}</span></div>
            <div className="my-4 flex justify-between text-lg font-bold"><span>Total</span><span>{formatINR(summary.totalPaise)}</span></div>
            <Link href="/checkout" onClick={onClose} className="flex w-full items-center justify-center gap-2 rounded-full bg-[#d99a2b] px-5 py-3.5 text-sm font-bold text-white hover:bg-[#c8891e]">
              Proceed to checkout <ArrowRight className="size-4" />
            </Link>
            <Link href="/cart" onClick={onClose} className="mt-3 block text-center text-xs font-semibold text-[#667a52] underline">View full cart</Link>
          </div>
        )}
      </aside>
    </div>
  )
}
