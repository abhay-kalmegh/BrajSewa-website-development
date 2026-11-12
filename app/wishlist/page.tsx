import { WishlistPage } from '@/components/wishlist-page'
import { getProducts } from '@/lib/api/catalog'

// The saved list is user-specific; fetch the live catalog at request time, not during the deployment build.
export const dynamic = 'force-dynamic'

export default async function Page() {
  const products = await getProducts()
  return <WishlistPage products={products} />
}
