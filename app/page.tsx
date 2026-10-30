import { HomeClient } from '@/components/home-client'
import { getProduct, getProducts } from '@/lib/api/catalog'

// Rendered per request so prices and stock are live (and `next build` doesn't need the API running).
export const dynamic = 'force-dynamic'

export default async function Page() {
  // The packing fee for custom seva boxes is an unlisted product, so it isn't in the public list.
  const [products, packing] = await Promise.all([getProducts(), getProduct('seva-box-packing').catch(() => null)])
  return <HomeClient products={products} packing={packing} />
}
