import type { MetadataRoute } from 'next'
import { getProducts } from '@/lib/api/catalog'

const publicRoutes = ['', '/shop', '/about', '/blog', '/faq', '/contact', '/help', '/track-order', '/shipping-policy', '/returns-refunds', '/cancellation-policy', '/payment-policy', '/privacy-policy', '/cookie-policy', '/terms']

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://brajsewa.com'
  const staticEntries = publicRoutes.map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: path === '/shop' || path === '/blog' ? 'daily' as const : 'monthly' as const,
    priority: path === '' ? 1 : path === '/shop' ? 0.9 : 0.6,
  }))
  const products = await getProducts().catch(() => [])
  const productEntries = products.map((product) => ({
    url: `${baseUrl}/shop/${product.slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))
  return [...staticEntries, ...productEntries]
}
