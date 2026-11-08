import { notFound } from 'next/navigation'
import { ARTICLES, BlogArticle } from '@/components/blog-article'

export function generateStaticParams() {
  return Object.keys(ARTICLES).map((slug) => ({ slug }))
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!(slug in ARTICLES)) notFound()
  return <BlogArticle slug={slug as keyof typeof ARTICLES} />
}
