'use client'

import { FormEvent, useState } from 'react'
import useSWR from 'swr'
import { useRequireAuth } from '@/lib/auth'
import { ApiError, api } from '@/lib/api'
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
  const { user, status, refresh } = useRequireAuth()
  const canLoad = status === 'ready' && Boolean(user)
  const fetcher = <T,>(path: string) => api<T>(path)
  const { data: productData, error: productsError, mutate: refreshProducts, isLoading: productsLoading } = useSWR<SellerProduct[]>(canLoad ? '/api/proxy/seller/products/' : null, fetcher, { revalidateOnFocus: false })
  const { data: orderData, error: ordersError, mutate: refreshOrders, isLoading: ordersLoading } = useSWR<SellerOrder[]>(canLoad ? '/api/proxy/seller/orders/' : null, fetcher, { revalidateOnFocus: false })
  const { data: notificationPrefs, error: preferencesError, mutate: refreshPreferences, isLoading: preferencesLoading } = useSWR<SellerNotificationPreferences>(canLoad ? '/api/proxy/seller/notifications/preferences/' : null, fetcher, { revalidateOnFocus: false })
  const { data: notificationHistory, error: historyError, mutate: refreshHistory, isLoading: historyLoading } = useSWR<SellerNotification[]>(canLoad ? '/api/proxy/seller/notifications/' : null, fetcher, { revalidateOnFocus: false })
  const products = productData ?? []
  const orders = orderData ?? []
  const notifications = notificationHistory ?? []
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [successMessage, setSuccessMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', slug: '', price: '', inventory: '', image: '' })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [notificationSaving, setNotificationSaving] = useState(false)
  const [notificationMessage, setNotificationMessage] = useState('')
  const [notificationError, setNotificationError] = useState('')
  const [notificationFieldErrors, setNotificationFieldErrors] = useState<Record<string, string[]>>({})

  async function saveNotificationPreferences() {
    if (!notificationPrefs) return
    setNotificationSaving(true)
    setNotificationError('')
    setNotificationMessage('')
    setNotificationFieldErrors({})
    try {
      const body = await api<SellerNotificationPreferences>('/api/proxy/seller/notifications/preferences/', {
        method: 'PATCH',
        body: JSON.stringify({
          phone: notificationPrefs.phone,
          email_enabled: notificationPrefs.email_enabled,
          whatsapp_opt_in: notificationPrefs.whatsapp_opt_in,
          sms_opt_in: notificationPrefs.sms_opt_in,
        }),
      })
      await refreshPreferences(body, { revalidate: false })
      setNotificationMessage('Notification preferences saved.')
    } catch (reason) {
      setNotificationError(reason instanceof Error ? reason.message : 'Unable to save notification preferences.')
      if (reason instanceof ApiError) setNotificationFieldErrors(reason.fieldErrors)
    } finally {
      setNotificationSaving(false)
    }
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setFieldErrors({})
    setSuccessMessage('')
    try {
    let imageUrl = form.image
    if (imageFile) {
      const upload = new FormData()
      upload.set('file', imageFile)
      const uploadResponse = await fetch('/api/uploads/product-image', { method: 'POST', credentials: 'include', body: upload })
      const uploadBody = await uploadResponse.json()
      if (!uploadResponse.ok) throw new Error(uploadBody.error || 'Unable to upload image.')
      imageUrl = uploadBody.url
    }
    const body = await api<SellerProduct>('/api/proxy/seller/products/', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name,
        slug: form.slug,
        price_paise: Math.round(Number(form.price) * 100),
        inventory: Number(form.inventory),
        image_url: imageUrl || '',
      }),
    })
    await refreshProducts([body, ...(productData ?? [])], { revalidate: false })
      setForm({ name: '', slug: '', price: '', inventory: '', image: '' })
      setImageFile(null)
      setSuccessMessage('Product submitted successfully.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create product.')
      if (reason instanceof ApiError) setFieldErrors(reason.fieldErrors)
    } finally {
      setSaving(false)
    }
  }

  if (status === 'error' && !user) return <PageShell><div role="alert"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#667a52]">BrajSewa.com</p><h1 className="mt-2 font-serif text-5xl">Seller workspace</h1><p className="mt-3">We couldn&apos;t check your session. The server may be waking up.</p><button type="button" onClick={() => void refresh()} className="mt-5 font-bold text-[#667a52] underline">Try again</button></div></PageShell>
  if (status === 'loading') return <PageShell><div role="status"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#667a52]">BrajSewa.com</p><h1 className="mt-2 font-serif text-5xl">Seller workspace</h1><p className="mt-3">Checking your seller access…</p></div></PageShell>
  if (!user) return null

  return (
    <PageShell><div className="mb-8"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#667a52]">Products, stock, seva</p><h1 className="mt-2 font-serif text-5xl">Seller workspace</h1></div>
      <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
        <form onSubmit={createProduct} className="rounded-3xl border border-[#24201d]/10 bg-white p-6 shadow-sm">
          <h2 className="font-serif text-2xl">Add a product</h2>
          <p className="mt-2 text-sm text-[#635951]">Approved sellers can create products for review and publishing.</p>
          <div className="mt-6 grid gap-4">
            <label className="grid gap-1 text-sm font-semibold">Name<input required value={form.name} aria-invalid={Boolean(fieldErrors.name)} onChange={(event) => setForm({ ...form, name: event.target.value })} className="rounded-xl border border-[#24201d]/15 px-3 py-3 font-normal" />{fieldErrors.name?.map((message) => <span key={message} className="text-xs font-normal text-[#a53d2e]">{message}</span>)}</label>
            <label className="grid gap-1 text-sm font-semibold">Slug<input required pattern="[a-z0-9-]+" value={form.slug} aria-invalid={Boolean(fieldErrors.slug)} onChange={(event) => setForm({ ...form, slug: event.target.value })} className="rounded-xl border border-[#24201d]/15 px-3 py-3 font-normal" />{fieldErrors.slug?.map((message) => <span key={message} className="text-xs font-normal text-[#a53d2e]">{message}</span>)}</label>
            <div className="grid grid-cols-2 gap-3"><label className="grid gap-1 text-sm font-semibold">Price (₹)<input required min="1" type="number" value={form.price} aria-invalid={Boolean(fieldErrors.price_paise || fieldErrors.price)} onChange={(event) => setForm({ ...form, price: event.target.value })} className="rounded-xl border border-[#24201d]/15 px-3 py-3 font-normal" />{(fieldErrors.price_paise ?? fieldErrors.price)?.map((message) => <span key={message} className="text-xs font-normal text-[#a53d2e]">{message}</span>)}</label><label className="grid gap-1 text-sm font-semibold">Stock<input required min="0" type="number" value={form.inventory} aria-invalid={Boolean(fieldErrors.inventory)} onChange={(event) => setForm({ ...form, inventory: event.target.value })} className="rounded-xl border border-[#24201d]/15 px-3 py-3 font-normal" />{fieldErrors.inventory?.map((message) => <span key={message} className="text-xs font-normal text-[#a53d2e]">{message}</span>)}</label></div>
            <label className="grid gap-1 text-sm font-semibold">Product image <span className="font-normal text-[#635951]">Optional, JPEG/PNG/WebP up to 5 MB</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} className="rounded-xl border border-[#24201d]/15 px-3 py-3 font-normal" /></label>
          </div>
          {error && <p role="alert" className="mt-4 rounded-xl bg-[#fff1ec] p-3 text-sm text-[#a53d2e]">{error}</p>}
          {successMessage && <p role="status" className="mt-4 rounded-xl bg-[#e5f2e3] p-3 text-sm text-[#38603b]">{successMessage}</p>}
          <button disabled={saving} className="mt-6 w-full rounded-full bg-[#d99a2b] px-5 py-3 font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Submit product'}</button>
        </form>
        <section className="rounded-3xl border border-[#24201d]/10 bg-[#fffaf2] p-6">
          <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#667a52]">Your catalog</p><h2 className="mt-2 font-serif text-3xl">Products and stock</h2></div><span className="rounded-full bg-white px-3 py-1 text-sm">{productsLoading ? '…' : productsError ? 'Unavailable' : `${products.length} items`}</span></div>
          <div className="mt-6 grid gap-3">
            {productsError ? <p role="alert" className="rounded-2xl bg-white p-5 text-sm text-[#a53d2e]">Unable to load seller products. <button type="button" onClick={() => void refreshProducts()} className="font-bold underline">Try again</button></p>
              : productsLoading ? <div className="space-y-3" aria-busy="true" aria-label="Loading seller products">{[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-2xl bg-white" />)}</div>
              : products.length === 0 ? <p className="rounded-2xl bg-white p-5 text-sm text-[#635951]">No products yet. Add your first devotional product to begin.</p>
                : products.map((product) => <article key={product.id} className="flex items-center justify-between gap-4 rounded-2xl bg-white p-4"><div><h3 className="font-semibold">{product.name}</h3><p className="mt-1 text-sm text-[#635951]">₹{(product.price_paise / 100).toLocaleString('en-IN')} · {product.inventory} in stock</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${product.listed ? 'bg-[#e5f2e3] text-[#38603b]' : 'bg-[#f3e4c9] text-[#805b1e]'}`}>{product.listed ? 'Published' : 'Review pending'}</span></article>)}
          </div>
        </section>
      </div>

      <section className="mt-8 rounded-3xl border border-[#24201d]/10 bg-white p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#667a52]">Seller alerts</p>
        <h2 className="mt-2 font-serif text-3xl">Notification preferences</h2>
        <p className="mt-2 text-sm text-[#635951]">Email can be enabled immediately. WhatsApp and SMS require a verified phone number, your opt-in, and configured provider credentials. By enabling a messaging channel, you agree to receive transactional order alerts there; you can opt out at any time.</p>
        {preferencesError ? <p role="alert" className="mt-5 rounded-xl bg-[#fff1ec] p-3 text-sm text-[#a53d2e]">Unable to load notification preferences. <button type="button" onClick={() => void refreshPreferences()} className="font-bold underline">Try again</button></p>
          : preferencesLoading ? <p role="status" className="mt-5 text-sm text-[#635951]">Loading notification preferences…</p>
          : notificationPrefs ? (
          <div className="mt-5 grid gap-4">
            <label className="grid gap-1 text-sm font-semibold">Mobile number (international format)
              <input value={notificationPrefs.phone} aria-invalid={Boolean(notificationFieldErrors.phone)} onChange={(event) => void refreshPreferences({ ...notificationPrefs, phone: event.target.value }, { revalidate: false })} placeholder="+919876543210" className="rounded-xl border border-[#24201d]/15 px-3 py-3 font-normal" />
              {notificationFieldErrors.phone?.map((message) => <span key={message} className="text-xs font-normal text-[#a53d2e]">{message}</span>)}
              <span className="font-normal text-xs text-[#635951]">{notificationPrefs.phone_verified ? 'Phone verified' : 'Phone not verified yet. Messaging alerts stay disabled until an administrator verifies it.'}</span>
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex items-start gap-2 rounded-xl bg-[#fffaf2] p-3 text-sm"><input type="checkbox" checked={notificationPrefs.email_enabled} onChange={(event) => void refreshPreferences({ ...notificationPrefs, email_enabled: event.target.checked }, { revalidate: false })} className="mt-1" /><span><strong>Email</strong><span className="block text-xs text-[#635951]">{notificationPrefs.configured_channels.email ? 'Provider configured' : 'SMTP not configured'}</span></span></label>
              <label className="flex items-start gap-2 rounded-xl bg-[#fffaf2] p-3 text-sm"><input type="checkbox" checked={notificationPrefs.whatsapp_opt_in} onChange={(event) => void refreshPreferences({ ...notificationPrefs, whatsapp_opt_in: event.target.checked }, { revalidate: false })} className="mt-1" /><span><strong>WhatsApp</strong><span className="block text-xs text-[#635951]">{notificationPrefs.configured_channels.whatsapp ? 'Provider configured' : 'Meta template/API not configured'}</span></span></label>
              <label className="flex items-start gap-2 rounded-xl bg-[#fffaf2] p-3 text-sm"><input type="checkbox" checked={notificationPrefs.sms_opt_in} onChange={(event) => void refreshPreferences({ ...notificationPrefs, sms_opt_in: event.target.checked }, { revalidate: false })} className="mt-1" /><span><strong>SMS</strong><span className="block text-xs text-[#635951]">{notificationPrefs.configured_channels.sms ? 'Provider configured' : 'MSG91 not configured'}</span></span></label>
            </div>
            {notificationError && <p role="alert" className="rounded-xl bg-[#fff1ec] p-3 text-sm text-[#a53d2e]">{notificationError}</p>}
            {notificationMessage && <p role="status" className="rounded-xl bg-[#e5f2e3] p-3 text-sm text-[#38603b]">{notificationMessage}</p>}
            <button type="button" onClick={saveNotificationPreferences} disabled={notificationSaving} className="w-fit rounded-full bg-[#d99a2b] px-5 py-3 font-bold text-white disabled:opacity-50">{notificationSaving ? 'Saving…' : 'Save notification preferences'}</button>
          </div>
        ) : <p className="mt-4 text-sm text-[#635951]">Loading notification preferences…</p>}
        <div className="mt-8">
          <h3 className="font-serif text-2xl">Notification history</h3>
          <div className="mt-4 grid gap-2">
            {historyError ? <p role="alert" className="rounded-xl bg-[#fff1ec] p-4 text-sm text-[#a53d2e]">Unable to load notification history. <button type="button" onClick={() => void refreshHistory()} className="font-bold underline">Try again</button></p>
              : historyLoading ? <div className="h-14 animate-pulse rounded-xl bg-[#fffaf2]" aria-busy="true" aria-label="Loading notification history" />
                : notifications.length === 0 ? <p className="rounded-xl bg-[#fffaf2] p-4 text-sm text-[#635951]">No notifications yet. A notification is queued after a customer payment is confirmed.</p>
                  : notifications.map((item) => (
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
          {ordersError ? <p role="alert" className="rounded-2xl bg-[#fff1ec] p-4 text-sm text-[#a53d2e]">Unable to load seller orders. <button type="button" onClick={() => void refreshOrders()} className="font-bold underline">Try again</button></p>
            : ordersLoading ? <div className="h-16 animate-pulse rounded-2xl bg-[#fffaf2]" aria-busy="true" aria-label="Loading seller orders" />
              : orders.length === 0 ? <p className="rounded-2xl bg-[#fffaf2] p-4 text-sm text-[#635951]">No seller orders yet.</p>
                : orders.map((order) => <article key={order.id} className="flex items-center justify-between rounded-2xl bg-[#fffaf2] p-4"><div><p className="font-semibold">Order #{order.id}</p><p className="mt-1 text-sm text-[#635951]">{new Date(order.created_at).toLocaleDateString('en-IN')}</p></div><div className="text-right"><p className="font-semibold">₹{(Number(order.total)).toLocaleString('en-IN')}</p><span className="text-xs uppercase tracking-wide text-[#667a52]">{order.status}</span></div></article>)}
        </div>
      </section>
    </PageShell>
  )
}
