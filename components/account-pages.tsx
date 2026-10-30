'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowRight, Heart, Package, ShieldCheck, Truck } from 'lucide-react'
import { OrderCard } from '@/components/order-card'
import { GenericPage } from '@/components/site-pages'
import { listOrders } from '@/lib/api/client'
import { useRequireAuth } from '@/lib/auth'
import type { OrderView } from '@/lib/types'

type Section = 'overview' | 'orders' | 'addresses' | 'profile'

const TITLES: Record<Section, string> = { overview: 'Welcome back.', orders: 'My orders', addresses: 'Saved address', profile: 'Profile' }
const TABS: Array<[Section, string, string]> = [
  ['overview', 'Overview', '/account'], ['orders', 'Orders', '/account/orders'],
  ['addresses', 'Address', '/account/addresses'], ['profile', 'Profile', '/account/profile'],
]

/** Loads the customer's orders once; shared by the overview and history pages. */
function useOrders(enabled: boolean) {
  const [orders, setOrders] = useState<OrderView[] | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setError(false)
    listOrders().then((result) => { if (!cancelled) setOrders(result) }).catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [enabled, attempt])
  return { orders, error, retry: () => setAttempt((n) => n + 1) }
}

export function AccountPages({ section }: { section: Section }) {
  const router = useRouter()
  const { user, status, signOut } = useRequireAuth()
  const { orders, error, retry } = useOrders(Boolean(user) && (section === 'overview' || section === 'orders'))

  if (status === 'loading' || !user) {
    return <GenericPage eyebrow="Your account" title={TITLES[section]}><p className="mt-8 text-[#24201d]/60">Loading your account…</p></GenericPage>
  }

  const firstName = user.firstName || user.name.split(' ')[0]
  const active = orders?.filter((order) => order.status === 'paid').length ?? 0

  return (
    <GenericPage eyebrow="Your account" title={section === 'overview' ? `Namaste, ${firstName}.` : TITLES[section]}>
      <nav className="mt-8 flex flex-wrap gap-2" aria-label="Account sections">
        {TABS.map(([key, label, href]) => (
          <Link key={key} href={href} aria-current={key === section ? 'page' : undefined}
            className={`rounded-full border px-4 py-2 text-sm font-semibold ${key === section ? 'border-[#667a52] bg-[#667a52] text-white' : 'border-[#24201d]/15 bg-white'}`}>{label}</Link>
        ))}
      </nav>

      {section === 'overview' && (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile href="/account/orders" icon={<Package className="text-[#667a52]" />} title="Your orders" text={orders ? `${orders.length} placed · ${active} confirmed` : 'Track and review'} />
            <Tile href="/account/addresses" icon={<Truck className="text-[#667a52]" />} title="Saved address" text={user.address ? `${user.address.city}, ${user.address.state}` : 'Saved when you check out'} />
            <Tile href="/wishlist" icon={<Heart className="text-[#d66a83]" />} title="Wishlist" text="Items you love" />
            <Tile href="/account/profile" icon={<ShieldCheck className="text-[#667a52]" />} title="Profile" text="Your details" />
          </div>
          <h2 className="mt-10 font-serif text-3xl">Recent orders</h2>
          <OrderList orders={orders?.slice(0, 3) ?? null} error={error} retry={retry} />
          {orders && orders.length > 3 && <Link href="/account/orders" className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-[#667a52] underline">See all orders <ArrowRight className="size-4" /></Link>}
        </>
      )}

      {section === 'orders' && <div className="mt-6"><OrderList orders={orders} error={error} retry={retry} /></div>}

      {section === 'addresses' && (
        <div className="mt-6 max-w-xl rounded-2xl bg-white p-6">
          {user.address ? (
            <p className="leading-7">{user.name}<br />{user.address.address}<br />{user.address.city}, {user.address.state} {user.address.postalCode}<br />{user.phone}</p>
          ) : (
            <p className="text-[#24201d]/65">You haven&apos;t saved an address yet. Tick &ldquo;Save this address&rdquo; at checkout and it will appear here.</p>
          )}
        </div>
      )}

      {section === 'profile' && (
        <div className="mt-6 max-w-xl rounded-2xl bg-white p-6">
          <dl className="grid gap-4 text-sm">
            <div><dt className="text-[#24201d]/55">Name</dt><dd className="font-semibold">{user.name}</dd></div>
            <div><dt className="text-[#24201d]/55">Email</dt><dd className="font-semibold">{user.email}</dd></div>
            <div><dt className="text-[#24201d]/55">Mobile</dt><dd className="font-semibold">{user.phone || 'Not added yet'}</dd></div>
          </dl>
        </div>
      )}

      <button type="button" onClick={async () => { await signOut(); router.push('/') }}
        className="mt-10 rounded-full border border-[#24201d]/20 px-6 py-3 text-sm font-bold">Sign out</button>
    </GenericPage>
  )
}

function Tile({ href, icon, title, text }: { href: string; icon: React.ReactNode; title: string; text: string }) {
  return (
    <Link href={href} className="group rounded-2xl border border-[#24201d]/10 bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#d99a2b]">
      {icon}<h3 className="mt-4 font-serif text-xl">{title}</h3><p className="mt-1 text-sm text-[#24201d]/55">{text}</p>
      <ArrowRight className="mt-4 size-4 text-[#667a52] transition group-hover:translate-x-1" />
    </Link>
  )
}

function OrderList({ orders, error, retry }: { orders: OrderView[] | null; error: boolean; retry: () => void }) {
  if (error) return <div className="mt-4 rounded-2xl bg-white p-6 text-sm">We couldn&apos;t load your orders. <button onClick={retry} className="font-bold text-[#667a52] underline">Try again</button></div>
  if (!orders) return <p className="mt-4 text-[#24201d]/60">Loading your orders…</p>
  if (orders.length === 0) {
    return (
      <div className="mt-4 rounded-2xl bg-white p-10 text-center">
        <p className="font-serif text-3xl">No orders yet.</p>
        <p className="mt-2 text-sm text-[#24201d]/60">When you place an order it will show up here.</p>
        <Link href="/shop" className="mt-5 inline-flex rounded-full bg-[#d99a2b] px-5 py-3 text-sm font-bold text-white">Explore products</Link>
      </div>
    )
  }
  return <div className="mt-4 grid gap-4">{orders.map((order) => <OrderCard key={order.id} order={order} />)}</div>
}
