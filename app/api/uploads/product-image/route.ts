import { put } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { authedFetch } from '@/lib/api/server'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_MULTIPART_BYTES = MAX_IMAGE_BYTES + 64 * 1024

async function readBoundedBody(request: Request): Promise<Uint8Array> {
  const contentLengthHeader = request.headers.get('content-length')
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader)
    if (!Number.isSafeInteger(contentLength) || contentLength < 0 || contentLength > MAX_MULTIPART_BYTES) {
      throw new RangeError('Upload request is too large.')
    }
  }

  if (!request.body) return new Uint8Array()
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > MAX_MULTIPART_BYTES) {
        await reader.cancel()
        throw new RangeError('Upload request is too large.')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}
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

  let boundedBody: Uint8Array
  try {
    boundedBody = await readBoundedBody(request)
  } catch {
    return NextResponse.json({ error: 'Upload requests must be 5 MB or smaller.' }, { status: 413 })
  }

  let formData: FormData
  try {
    const boundedRequest = new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body: boundedBody,
    })
    formData = await boundedRequest.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid image upload request.' }, { status: 400 })
  }
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
