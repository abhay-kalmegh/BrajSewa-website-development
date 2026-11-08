import { put } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { authedFetch } from '@/lib/api/server'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function POST(request: Request) {
  const sellerResponse = await authedFetch('/seller/access/', { method: 'GET', req: request })
  if (!sellerResponse || sellerResponse.status === 401) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  if (!sellerResponse.ok) return NextResponse.json({ error: 'Approved seller access is required.' }, { status: 403 })

  const formData = await request.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) return NextResponse.json({ error: 'An image file is required.' }, { status: 400 })
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: 'Only JPEG, PNG, and WebP images are supported.' }, { status: 400 })
  if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: 'Images must be 5 MB or smaller.' }, { status: 413 })

  const extension = file.type.split('/')[1].replace('jpeg', 'jpg')
  const blob = await put(`products/${crypto.randomUUID()}.${extension}`, file, { access: 'public' })
  return NextResponse.json({ url: blob.url })
}
