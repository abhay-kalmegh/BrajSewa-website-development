import { WishlistPage } from '@/components/wishlist-page'
import { getProducts } from '@/lib/api/catalog'

export default async function Page() {
  const products = await getProducts()
  return <WishlistPage products={products} />
}
