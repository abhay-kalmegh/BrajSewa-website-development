import type { MetadataRoute } from 'next'

const publicRoutes = ['', '/shop', '/about', '/blog', '/faq', '/contact', '/help', '/track-order', '/shipping-policy', '/returns-refunds', '/cancellation-policy', '/payment-policy', '/privacy-policy', '/cookie-policy', '/terms']

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://brajsewa.com'
  return publicRoutes.map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: path === '/shop' || path === '/blog' ? 'daily' : 'monthly',
    priority: path === '' ? 1 : path === '/shop' ? 0.9 : 0.6,
  }))
}
