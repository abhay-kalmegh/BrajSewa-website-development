import { ShopClient } from '@/components/shop-client'
import { getProducts } from '@/lib/api/catalog'

// Rendered per request so stock and prices are never stale (and the build doesn't need the API).
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Shop · BrajSewa.com' }

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const [products, { category }] = await Promise.all([getProducts(), searchParams])
  return <ShopClient products={products} initialCategory={category || 'All'} />
}
