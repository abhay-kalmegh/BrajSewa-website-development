'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRequireAuth } from '@/lib/auth'
import { ApiError } from '@/lib/api/client'
import { PageShell } from '@/components/site-pages'

type SellerOrder = {
  id: number
  status: string
  total: number
  created_at: string
}

type SellerNotificationPreferences = {
  phone: string
  phone_verified: boolean
  email_enabled: boolean
  whatsapp_opt_in: boolean
  sms_opt_in: boolean
  configured_channels: { email: boolean; whatsapp: boolean; sms: boolean }
}

type SellerNotification = {
  id: number
  order_id: number
  channel: 'email' | 'whatsapp' | 'sms'
  recipient: string
  status: 'queued' | 'sending' | 'sent' | 'failed' | 'skipped'
  attempt_count: number
  error_message: string
  sent_at: string | null
  created_at: string
}

type SellerProduct = {
  id: number
  name: string
  slug: string
  price_paise: number
  inventory: number
  active: boolean
  listed: boolean
  image?: string | null
}

export function SellerDashboard() {
  const { user, status } = useRequireAuth()
  const [products, setProducts] = useState<SellerProduct[]>([])
  const [orders, setOrders] = useState<SellerOrder[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', slug: '', price: '', inventory: '', image: '' })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [notificationPrefs, setNotificationPrefs] = useState<SellerNotificationPreferences | null>(null)
  const [notificationHistory, setNotificationHistory] = useState<SellerNotification[]>([])
  const [notificationSaving, setNotificationSaving] = useState(false)
  const [notificationMessage, setNotificationMessage] = useState('')
  const [notificationError, setNotificationError] = useState('')

  useEffect(() => {
    if (status !== 'ready' || !user) return
    fetch('/api/proxy/seller/products/', { credentials: 'same-origin' })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.detail || 'Unable to load seller products.')
        setProducts(body)
      })
      .catch((reason: Error) => setError(reason.message))
    fetch('/api/proxy/seller/orders/', { credentials: 'same-origin' })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.detail || 'Unable to load seller orders.')
        setOrders(body)
      })
      .catch((reason: Error) => setError(reason.message))
    fetch('/api/proxy/seller/notifications/preferences/', { credentials: 'same-origin' })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.detail || 'Unable to load notification preferences.')
        setNotificationPrefs(body)
      })
      .catch((reason: Error) => setNotificationError(reason.message))
    fetch('/api/proxy/seller/notifications/', { credentials: 'same-origin' })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.detail || 'Unable to load notification history.')
        setNotificationHistory(body)
      })
      .catch((reason: Error) => setNotificationError(reason.message))
  }, [status, user])

  async function saveNotificationPreferences() {
    if (!notificationPrefs) return
    setNotificationSaving(true)
    setNotificationError('')
    setNotificationMessage('')
    try {
      const response = await fetch('/api/proxy/seller/notifications/preferences/', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: notificationPrefs.phone,
          email_enabled: notificationPrefs.email_enabled,
          whatsapp_opt_in: notificationPrefs.whatsapp_opt_in,
          sms_opt_in: notificationPrefs.sms_opt_in,
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.detail || 'Unable to save notification preferences.')
      setNotificationPrefs(body)
      setNotificationMessage('Notification preferences saved.')
    } catch (reason) {
      setNotificationError(reason instanceof Error ? reason.message : 'Unable to save notification preferences.')
    } finally {
      setNotificationSaving(false)
    }
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
    let imageUrl = form.image
    if (imageFile) {
      const upload = new FormData()
      upload.set('file', imageFile)
      const uploadResponse = await fetch('/api/uploads/product-image', { method: 'POST', body: upload })
      const uploadBody = await uploadResponse.json()
      if (!uploadResponse.ok) throw new Error(uploadBody.error || 'Unable to upload image.')
      imageUrl = uploadBody.url
    }
    const response = await fetch('/api/proxy/seller/products/', {
      method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug,
          price_paise: Math.round(Number(form.price) * 100),
          inventory: Number(form.inventory),
          image_url: imageUrl || '',
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new ApiError(body.detail || 'Unable to create product.', response.status, body)
      setProducts((current) => [body, ...current])
      setForm({ name: '', slug: '', price: '', inventory: '', image: '' })
    setImageFile(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create product.')
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading') return <PageShell><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#667a52]">BrajSewa.com</p><h1 className="mt-2 font-serif text-5xl">Seller workspace</h1><p className="mt-3">Checking your seller access…</p></div></PageShell>
  if (!user) return null

  return (
    <PageShell><div className="mb-8"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#667a52]">Products, stock, seva</p><h1 className="mt-2 font-serif text-5xl">Seller workspace</h1></div>
      <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
        <form onSubmit={createProduct} className="rounded-3xl border border-[#24201d]/10 bg-white p-6 shadow-sm">
          <h2 className="font-serif text-2xl">Add a product</h2>
          <p className="mt-2 text-sm text-[#635951]">Approved sellers can create products for review and publishing.</p>
          <div className="mt-6 grid gap-4">
            <label className="grid gap-1 text-sm font-semibold">Name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="rounded-xl border border-[#24201d]/15 px-3 py-3 font-normal" /></label>
            <label className="grid gap-1 text-sm font-semibold">Slug<input required pattern="[a-z0-9-]+" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} className="rounded-xl border border-[#24201d]/15 px-3 py-3 font-normal" /></label>
            <div className="grid grid-cols-2 gap-3"><label className="grid gap-1 text-sm font-semibold">Price (₹)<input required min="1" type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} className="rounded-xl border border-[#24201d]/15 px-3 py-3 font-normal" /></label><label className="grid gap-1 text-sm font-semibold">Stock<input required min="0" type="number" value={form.inventory} onChange={(event) => setForm({ ...form, inventory: event.target.value })} className="rounded-xl border border-[#24201d]/15 px-3 py-3 font-normal" /></label></div>
            <label className="grid gap-1 text-sm font-semibold">Product image <span className="font-normal text-[#635951]">Optional, JPEG/PNG/WebP up to 5 MB</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} className="rounded-xl border border-[#24201d]/15 px-3 py-3 font-normal" /></label>
          </div>
          {error && <p role="alert" className="mt-4 rounded-xl bg-[#fff1ec] p-3 text-sm text-[#a53d2e]">{error}</p>}
          <button disabled={saving} className="mt-6 w-full rounded-full bg-[#d99a2b] px-5 py-3 font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Submit product'}</button>
        </form>
        <section className="rounded-3xl border border-[#24201d]/10 bg-[#fffaf2] p-6">
          <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#667a52]">Your catalog</p><h2 className="mt-2 font-serif text-3xl">Products and stock</h2></div><span className="rounded-full bg-white px-3 py-1 text-sm">{products.length} items</span></div>
          <div className="mt-6 grid gap-3">{products.length === 0 ? <p className="rounded-2xl bg-white p-5 text-sm text-[#635951]">No products yet. Add your first devotional product to begin.</p> : products.map((product) => <article key={product.id} className="flex items-center justify-between gap-4 rounded-2xl bg-white p-4"><div><h3 className="font-semibold">{product.name}</h3><p className="mt-1 text-sm text-[#635951]">₹{(product.price_paise / 100).toLocaleString('en-IN')} · {product.inventory} in stock</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${product.listed ? 'bg-[#e5f2e3] text-[#38603b]' : 'bg-[#f3e4c9] text-[#805b1e]'}`}>{product.listed ? 'Published' : 'Review pending'}</span></article>)}</div>
        </section>
      </div>

      <section className="mt-8 rounded-3xl border border-[#24201d]/10 bg-white p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#667a52]">Seller alerts</p>
        <h2 className="mt-2 font-serif text-3xl">Notification preferences</h2>
        <p className="mt-2 text-sm text-[#635951]">Email can be enabled immediately. WhatsApp and SMS require a verified phone number, your opt-in, and configured provider credentials. By enabling a messaging channel, you agree to receive transactional order alerts there; you can opt out at any time.</p>
        {notificationPrefs ? (
          <div className="mt-5 grid gap-4">
            <label className="grid gap-1 text-sm font-semibold">Mobile number (international format)
              <input value={notificationPrefs.phone} onChange={(event) => setNotificationPrefs({ ...notificationPrefs, phone: event.target.value })} placeholder="+919876543210" className="rounded-xl border border-[#24201d]/15 px-3 py-3 font-normal" />
              <span className="font-normal text-xs text-[#635951]">{notificationPrefs.phone_verified ? 'Phone verified' : 'Phone not verified yet. Messaging alerts stay disabled until an administrator verifies it.'}</span>
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex items-start gap-2 rounded-xl bg-[#fffaf2] p-3 text-sm"><input type="checkbox" checked={notificationPrefs.email_enabled} onChange={(event) => setNotificationPrefs({ ...notificationPrefs, email_enabled: event.target.checked })} className="mt-1" /><span><strong>Email</strong><span className="block text-xs text-[#635951]">{notificationPrefs.configured_channels.email ? 'Provider configured' : 'SMTP not configured'}</span></span></label>
              <label className="flex items-start gap-2 rounded-xl bg-[#fffaf2] p-3 text-sm"><input type="checkbox" checked={notificationPrefs.whatsapp_opt_in} onChange={(event) => setNotificationPrefs({ ...notificationPrefs, whatsapp_opt_in: event.target.checked })} className="mt-1" /><span><strong>WhatsApp</strong><span className="block text-xs text-[#635951]">{notificationPrefs.configured_channels.whatsapp ? 'Provider configured' : 'Meta template/API not configured'}</span></span></label>
              <label className="flex items-start gap-2 rounded-xl bg-[#fffaf2] p-3 text-sm"><input type="checkbox" checked={notificationPrefs.sms_opt_in} onChange={(event) => setNotificationPrefs({ ...notificationPrefs, sms_opt_in: event.target.checked })} className="mt-1" /><span><strong>SMS</strong><span className="block text-xs text-[#635951]">{notificationPrefs.configured_channels.sms ? 'Provider configured' : 'MSG91 not configured'}</span></span></label>
            </div>
            {notificationError && <p role="alert" className="rounded-xl bg-[#fff1ec] p-3 text-sm text-[#a53d2e]">{notificationError}</p>}
            {notificationMessage && <p role="status" className="rounded-xl bg-[#e5f2e3] p-3 text-sm text-[#38603b]">{notificationMessage}</p>}
            <button type="button" onClick={saveNotificationPreferences} disabled={notificationSaving} className="w-fit rounded-full bg-[#d99a2b] px-5 py-3 font-bold text-white disabled:opacity-50">{notificationSaving ? 'Saving…' : 'Save notification preferences'}</button>
          </div>
        ) : <p className="mt-4 text-sm text-[#635951]">Loading notification preferences…</p>}
        <div className="mt-8">
          <h3 className="font-serif text-2xl">Notification history</h3>
          <div className="mt-4 grid gap-2">
            {notificationHistory.length === 0 ? <p className="rounded-xl bg-[#fffaf2] p-4 text-sm text-[#635951]">No notifications yet. A notification is queued after a customer payment is confirmed.</p> : notificationHistory.map((item) => (
              <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#fffaf2] p-4">
                <div><p className="font-semibold">Order #{item.order_id} · {item.channel.toUpperCase()}</p><p className="text-xs text-[#635951]">{item.recipient} · {new Date(item.created_at).toLocaleString('en-IN')}</p>{item.error_message && <p className="mt-1 text-xs text-[#a53d2e]">{item.error_message}</p>}</div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.status === 'sent' ? 'bg-[#e5f2e3] text-[#38603b]' : item.status === 'failed' ? 'bg-[#fff1ec] text-[#a53d2e]' : 'bg-[#f3e4c9] text-[#805b1e]'}`}>{item.status} · {item.attempt_count} attempts</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-3xl border border-[#24201d]/10 bg-white p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#667a52]">Fulfilment</p>
        <h2 className="mt-2 font-serif text-3xl">Recent orders containing your products</h2>
        <div className="mt-5 grid gap-3">
          {orders.length === 0 ? <p className="rounded-2xl bg-[#fffaf2] p-4 text-sm text-[#635951]">No seller orders yet.</p> : orders.map((order) => <article key={order.id} className="flex items-center justify-between rounded-2xl bg-[#fffaf2] p-4"><div><p className="font-semibold">Order #{order.id}</p><p className="mt-1 text-sm text-[#635951]">{new Date(order.created_at).toLocaleDateString('en-IN')}</p></div><div className="text-right"><p className="font-semibold">₹{(Number(order.total)).toLocaleString('en-IN')}</p><span className="text-xs uppercase tracking-wide text-[#667a52]">{order.status}</span></div></article>)}
        </div>
      </section>
    </PageShell>
  )
}
