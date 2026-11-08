import { put } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { authedFetch } from '@/lib/api/server'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function hasImageSignature(type: string, bytes: Uint8Array) {
  if (type === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (type === 'image/png') return bytes.length >= 8 && bytes.slice(0, 8).every((byte, index) => byte === [137, 80, 78, 71, 13, 10, 26, 10][index])
  if (type === 'image/webp') return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
  return false
}

export async function POST(request: Request) {
  const sellerResponse = await authedFetch('/seller/access/', { method: 'GET', req: request })
  if (!sellerResponse || sellerResponse.status === 401) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  if (!sellerResponse.ok) return NextResponse.json({ error: 'Approved seller access is required.' }, { status: 403 })

  const formData = await request.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) return NextResponse.json({ error: 'An image file is required.' }, { status: 400 })
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: 'Only JPEG, PNG, and WebP images are supported.' }, { status: 400 })
  if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: 'Images must be 5 MB or smaller.' }, { status: 413 })

  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!hasImageSignature(file.type, bytes)) return NextResponse.json({ error: 'The uploaded file is not a valid image.' }, { status: 400 })

  const extension = file.type.split('/')[1].replace('jpeg', 'jpg')
  const safeFile = new File([bytes], `upload.${extension}`, { type: file.type })
  const blob = await put(`products/${crypto.randomUUID()}.${extension}`, safeFile, { access: 'public' })
  return NextResponse.json({ url: blob.url })
}
