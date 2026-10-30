import Link from 'next/link'
import type { Metadata } from 'next'
import { ProductDetail } from '@/components/product-detail'
import { getProduct } from '@/lib/api/catalog'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const product = await getProduct((await params).slug).catch(() => null)
  return product
    ? { title: `${product.name} · BrajSewa.com`, description: product.description, openGraph: { images: product.image.startsWith('http') ? [product.image] : undefined } }
    : { title: 'Product not found · BrajSewa.com' }
}

export default async function ProductPage({ params }: Params) {
  const product = await getProduct((await params).slug)
  if (!product) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#fff9f0] px-5 text-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d66a83]">Product not found</p>
          <h1 className="mt-3 font-serif text-5xl">This seva item has moved.</h1>
          <Link href="/shop" className="mt-8 inline-flex rounded-full bg-[#d99a2b] px-6 py-3 font-bold text-white">Return to shop</Link>
        </div>
      </main>
    )
  }
  return <ProductDetail product={product} />
}
