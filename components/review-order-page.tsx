import Link from 'next/link'
import { ArrowLeft, Check, LockKeyhole, MapPin, Package, UserRound } from 'lucide-react'

const items = [
  { name: 'Tulsi Mala', detail: '1 × ₹299', price: 299 },
  { name: 'Braj Chandan Tilak', detail: '1 × ₹349', price: 349 },
  { name: 'Seva Diya Set', detail: '1 × ₹398', price: 398 },
]

export function ReviewOrderPage() {
  return (
    <main className="min-h-screen bg-[#fff9f0] text-[#24201d]">
      <header className="border-b border-[#24201d]/10 bg-[#fff9f0]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 lg:px-8">
          <Link href="/" className="font-serif text-2xl">HomeShop<span className="text-[#d66a83]">2</span></Link>
          <span className="flex items-center gap-2 text-sm font-semibold text-[#667a52]"><LockKeyhole className="size-4" /> Secure checkout</span>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-5 py-10 lg:px-8 lg:py-14">
        <Link href="/checkout/information" className="inline-flex items-center gap-2 text-sm font-semibold text-[#667a52]"><ArrowLeft className="size-4" /> Back to information</Link>
        <div className="mt-8 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#667a52]">
          {['Information', 'Shipping', 'Payment', 'Review'].map((step, index) => <span key={step} className="flex items-center gap-2"><span className="rounded-full bg-[#667a52] px-3 py-1.5 text-white">{index + 1}. {step}</span>{index < 3 && <span className="text-[#24201d]/25">→</span>}</span>)}
        </div>
        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_380px]">
          <section>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d66a83]">Almost ready</p>
            <h1 className="mt-3 font-serif text-5xl">Review your order.</h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-[#24201d]/65">Please check your details and items once more. Your seva will be packed with care from Vrindavan.</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-white p-5"><div className="flex items-center gap-2 font-semibold"><UserRound className="size-4 text-[#667a52]" /> Contact information</div><p className="mt-4 text-sm text-[#24201d]/55">Your email and mobile number will be used for order updates.</p><Link href="/checkout/information" className="mt-4 inline-block text-sm font-bold text-[#667a52] underline">Edit details</Link></div>
              <div className="rounded-2xl bg-white p-5"><div className="flex items-center gap-2 font-semibold"><MapPin className="size-4 text-[#667a52]" /> Delivery address</div><p className="mt-4 text-sm text-[#24201d]/55">Your order will be delivered to the address entered during checkout.</p><Link href="/checkout/information" className="mt-4 inline-block text-sm font-bold text-[#667a52] underline">Edit address</Link></div>
            </div>
            <div className="mt-4 rounded-2xl bg-[#f3e4c9] p-5"><div className="flex items-center gap-2 font-semibold"><Package className="size-4 text-[#667a52]" /> Shipping method</div><p className="mt-3 text-sm text-[#24201d]/65">Standard delivery · 3–7 business days · <strong>FREE</strong></p></div>
            <button type="button" className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#d99a2b] px-6 py-4 text-sm font-bold text-white hover:bg-[#c8891e] sm:w-auto"><Check className="size-4" /> Place seva order</button>
          </section>
          <aside className="h-fit rounded-2xl bg-[#f3e4c9] p-6"><h2 className="font-serif text-3xl">Your items</h2><div className="mt-6 flex flex-col gap-4">{items.map((item) => <div key={item.name} className="flex items-center justify-between gap-4 text-sm"><div><p className="font-semibold">{item.name}</p><p className="text-[#24201d]/55">{item.detail}</p></div><strong>₹{item.price.toLocaleString('en-IN')}</strong></div>)}</div><div className="my-6 h-px bg-[#24201d]/10" /><div className="flex justify-between text-sm"><span>Subtotal</span><span>₹1,046</span></div><div className="mt-3 flex justify-between text-sm"><span>Shipping</span><span className="font-bold text-[#667a52]">FREE</span></div><div className="my-5 h-px bg-[#24201d]/10" /><div className="flex justify-between text-lg font-bold"><span>Total</span><span>₹1,046</span></div></aside>
        </div>
      </div>
    </main>
  )
}
