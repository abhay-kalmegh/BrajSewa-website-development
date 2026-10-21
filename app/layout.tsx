import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'
import { CartProvider } from '@/lib/cart'

export const metadata: Metadata = {
  title: 'BrajSewa.com — Seva, Bhakti, Life',
  description: 'Discover devotional essentials for Shri Thakurji seva, pooja, bhakti, and everyday spiritual living.',
  metadataBase: new URL('https://brajsewa.com'),
  alternates: { canonical: '/' },
  openGraph: { title: 'BrajSewa.com — Seva, Bhakti, Life', description: 'Discover devotional essentials for Shri Thakurji seva, pooja, bhakti, and everyday spiritual living.', url: 'https://brajsewa.com', siteName: 'BrajSewa.com', type: 'website' },
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-192.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-192.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <CartProvider>{children}</CartProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
