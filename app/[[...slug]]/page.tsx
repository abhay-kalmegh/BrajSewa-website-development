import { AccountPage, AuthPage, BlogPage, CartPage, CheckoutPage, GenericPage, HelpPage, PolicyPage } from '@/components/site-pages'

export default async function MissingPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const slug = (await params).slug || []
  const path = `/${slug.join('/')}`
  if (path === '/cart') return <CartPage />
  if (path.startsWith('/checkout/')) return <CheckoutPage step={slug[1] || 'information'} />
  if (path === '/wishlist') return <GenericPage eyebrow="Your saved products" title="Wishlist"><div className="mt-10"><p className="mb-6 text-sm text-[#24201d]/60">Save the products you love.</p><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div className="col-span-full rounded-2xl bg-white p-10 text-center"><p className="font-serif text-3xl">Your wishlist is empty.</p><a href="/#shop" className="mt-5 inline-flex rounded-full bg-[#d99a2b] px-5 py-3 text-sm font-bold text-white">Explore Products</a></div></div></div></GenericPage>
  if (path === '/account' || path.startsWith('/account/')) return <AccountPage section={slug[1] || 'overview'} />
  if (path === '/login') return <AuthPage />
  if (path === '/register') return <AuthPage register />
  if (path === '/forgot-password') return <GenericPage eyebrow="Account" title="Reset your password."><div className="mt-8 max-w-md rounded-2xl bg-white p-6"><form className="flex flex-col gap-4"><label className="text-sm font-semibold">Email or mobile<input className="mt-2 w-full rounded-xl border border-[#24201d]/15 px-4 py-3 outline-none" /></label><button className="rounded-full bg-[#d99a2b] px-5 py-3 text-sm font-bold text-white">Send Reset Link</button></form></div></GenericPage>
  if (path === '/help' || path === '/faq') return <HelpPage />
  if (path.startsWith('/blog/')) return <BlogPage article />
  if (path === '/blog') return <BlogPage />
  if (['/shipping-policy', '/returns-refunds', '/cancellation-policy', '/payment-policy', '/privacy-policy', '/terms', '/cookie-policy'].includes(path)) return <PolicyPage title={path.slice(1).replaceAll('-', ' ')} />
  const titles: Record<string, string> = { '/contact': 'Contact us', '/about': 'Our story', '/track-order': 'Track your order', '/order/success/HS2-XXXXX': 'Your Seva Has Been Received', '/reset-password': 'Create a new password' }
  return <GenericPage eyebrow="HomeShop2" title={titles[path] || 'Looks like this page wandered away.'} />
}
