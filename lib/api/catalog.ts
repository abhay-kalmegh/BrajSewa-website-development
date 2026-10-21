/**
 * Public catalogue reads for server components. Fetched fresh on every request (no caching) so stock
 * and prices on the page never lag behind what checkout will enforce.
 */
import { djangoFetch } from '@/lib/api/server'
import type { Product } from '@/lib/types'

export async function getProducts(): Promise<Product[]> {
  const response = await djangoFetch('/products/')
  if (!response.ok) throw new Error(`Catalogue request failed (${response.status})`)
  return response.json()
}

/** Returns null for an unknown slug so the page can render notFound(). Other failures throw. */
export async function getProduct(slug: string): Promise<Product | null> {
  if (!/^[A-Za-z0-9_-]+$/.test(slug)) return null
  const response = await djangoFetch(`/products/${slug}/`)
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Product request failed (${response.status})`)
  return response.json()
}
