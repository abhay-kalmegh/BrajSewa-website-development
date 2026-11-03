'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRequireAuth } from '@/lib/auth'
import { ApiError } from '@/lib/api/client'
import { PageShell } from '@/components/site-pages'

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
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', slug: '', price: '', inventory: '', image: '' })

  useEffect(() => {
    if (status !== 'ready' || !user) return
    fetch('/api/proxy/seller/products/', { credentials: 'same-origin' })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.detail || 'Unable to load seller products.')
        setProducts(body)
      })
      .catch((reason: Error) => setError(reason.message))
  }, [status, user])

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/proxy/seller/products/', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug,
          price_paise: Math.round(Number(form.price) * 100),
          inventory: Number(form.inventory),
          image_url: form.image || '',
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new ApiError(body.detail || 'Unable to create product.', response.status, body)
      setProducts((current) => [body, ...current])
      setForm({ name: '', slug: '', price: '', inventory: '', image: '' })
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
            <label className="grid gap-1 text-sm font-semibold">Image URL <span className="font-normal text-[#635951]">Optional</span><input type="url" value={form.image} onChange={(event) => setForm({ ...form, image: event.target.value })} className="rounded-xl border border-[#24201d]/15 px-3 py-3 font-normal" /></label>
          </div>
          {error && <p role="alert" className="mt-4 rounded-xl bg-[#fff1ec] p-3 text-sm text-[#a53d2e]">{error}</p>}
          <button disabled={saving} className="mt-6 w-full rounded-full bg-[#d99a2b] px-5 py-3 font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Submit product'}</button>
        </form>
        <section className="rounded-3xl border border-[#24201d]/10 bg-[#fffaf2] p-6">
          <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#667a52]">Your catalog</p><h2 className="mt-2 font-serif text-3xl">Products and stock</h2></div><span className="rounded-full bg-white px-3 py-1 text-sm">{products.length} items</span></div>
          <div className="mt-6 grid gap-3">{products.length === 0 ? <p className="rounded-2xl bg-white p-5 text-sm text-[#635951]">No products yet. Add your first devotional product to begin.</p> : products.map((product) => <article key={product.id} className="flex items-center justify-between gap-4 rounded-2xl bg-white p-4"><div><h3 className="font-semibold">{product.name}</h3><p className="mt-1 text-sm text-[#635951]">₹{(product.price_paise / 100).toLocaleString('en-IN')} · {product.inventory} in stock</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${product.listed ? 'bg-[#e5f2e3] text-[#38603b]' : 'bg-[#f3e4c9] text-[#805b1e]'}`}>{product.listed ? 'Published' : 'Review pending'}</span></article>)}</div>
        </section>
      </div>
    </PageShell>
  )
}
