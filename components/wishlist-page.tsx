'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Heart, ShoppingBag, X } from 'lucide-react'
import { GenericPage } from '@/components/site-pages'
import { useWishlist } from '@/lib/wishlist'
import { formatRupees } from '@/lib/pricing'
import type { Product } from '@/lib/types'

export function WishlistPage({ products }: { products: Product[] }) {
  const { ids, toggle } = useWishlist()
  const saved = products.filter((product) => ids.includes(product.slug) && product.active)

  return (
    <GenericPage eyebrow="Your saved products" title="Wishlist">
      {saved.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-white p-10 text-center">
          <Heart className="mx-auto size-8 text-[#d99a2b]" aria-hidden="true" />
          <p className="mt-4 font-serif text-3xl">Your wishlist is empty.</p>
          <Link href="/shop" className="mt-5 inline-flex rounded-full bg-[#d99a2b] px-5 py-3 text-sm font-bold text-white">Explore Products</Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {saved.map((product) => (
            <article key={product.slug} className="overflow-hidden rounded-2xl bg-white shadow-sm">
              <Link href={`/shop/${product.slug}`} className="block">
                <div className="relative aspect-square bg-[#f2eadc]">
                  <Image src={product.image} alt={product.name} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className="object-cover" />
                </div>
              </Link>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#667a52]">{product.category}</p><h2 className="mt-2 font-serif text-2xl">{product.name}</h2><p className="mt-2 font-semibold">{formatRupees(product.price)}</p></div>
                  <button type="button" onClick={() => toggle(product.slug)} aria-label={`Remove ${product.name} from wishlist`} className="rounded-full p-2 text-[#667a52] hover:bg-[#f2eadc]"><X className="size-5" /></button>
                </div>
                <Link href={`/shop/${product.slug}`} className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#667a52]"><ShoppingBag className="size-4" /> View product</Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </GenericPage>
  )
}
