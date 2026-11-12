import { SafeAnalytics } from '@/components/safe-analytics'
import { ApiStatusBanner } from '@/components/api-status-banner'
import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AuthProvider } from '@/lib/auth'
import { CartProvider } from '@/lib/cart'
import { WishlistProvider } from '@/lib/wishlist'

export const metadata: Metadata = {
  title: 'BrajSewa.com — Seva, Bhakti, Life',
  description: 'Discover devotional essentials for Shri Thakurji seva, pooja, bhakti, and everyday spiritual living.',
  metadataBase: new URL('https://brajsewa.com'),
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
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
      <body className="antialiased" suppressHydrationWarning>
        <ApiStatusBanner />
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-[#24201d] focus:px-5 focus:py-3 focus:text-sm focus:font-semibold focus:text-white">Skip to main content</a>
        <AuthProvider>
          <WishlistProvider><CartProvider>{children}</CartProvider></WishlistProvider>
        </AuthProvider>
        <SafeAnalytics />
      </body>
    </html>
  )
}
