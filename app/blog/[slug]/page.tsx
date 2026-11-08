import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ARTICLES, BlogArticle } from '@/components/blog-article'

export function generateStaticParams() {
  return Object.keys(ARTICLES).map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const article = ARTICLES[slug as keyof typeof ARTICLES]
  if (!article) return { title: 'Journal | BrajSewa.com' }
  return { title: `${article.title} | BrajSewa.com`, description: article.intro, alternates: { canonical: `/blog/${slug}` }, openGraph: { title: article.title, description: article.intro, type: 'article' } }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!(slug in ARTICLES)) notFound()
  return <BlogArticle slug={slug as keyof typeof ARTICLES} />
}
