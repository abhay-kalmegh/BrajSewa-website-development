import Link from 'next/link'
import { GenericPage } from '@/components/site-pages'

export const ARTICLES = {
  'naam-jap-as-a-daily-habit': {
    title: 'Naam Jap as a daily habit',
    intro: 'A gentle practice for returning to presence, one repetition at a time.',
    sections: [['Begin with one minute', 'Choose a quiet moment that already exists in your day. Let the repetition be simple rather than perfect.'], ['Let the rhythm lead', 'A mala, a soft breath, or a familiar phrase can give the mind somewhere kind to rest.'], ['Carry it lightly', 'The practice is not another task to complete. It is a small way to return to what matters.']],
  },
  'a-little-braj-at-home': {
    title: 'A little Braj at home',
    intro: 'Small rituals can make ordinary corners feel more grounded and generous.',
    sections: [['Make a welcoming corner', 'A clean cloth, a meaningful image, or a small lamp can mark a place for stillness.'], ['Keep it tactile', 'Choose objects that invite care: natural fibres, handmade textures, and things that age beautifully.'], ['Share the feeling', 'The most lasting rituals are easy to offer to a guest, a child, or a tired version of yourself.']],
  },
  'choosing-a-seva-box': {
    title: 'Choosing a seva box',
    intro: 'A thoughtful gift begins with the feeling you want the recipient to carry forward.',
    sections: [['Start with the person', 'Think about their daily rhythm, the spaces they enjoy, and the kind of care they appreciate.'], ['Choose fewer, better things', 'A small collection with a clear purpose often feels more personal than a crowded basket.'], ['Add your own note', 'A few honest words make the gift unmistakably yours and turn an object into a gesture.']],
  },
} as const

export function BlogArticle({ slug }: { slug: keyof typeof ARTICLES }) {
  const article = ARTICLES[slug]
  return <GenericPage eyebrow="Journal · Devotional living" title={article.title}>
    <article className="mt-10 max-w-3xl rounded-2xl bg-white p-6 sm:p-10">
      <p className="text-lg leading-8 text-[#24201d]/70">{article.intro}</p>
      <div className="mt-8 flex flex-col gap-8">
        {article.sections.map(([heading, body]) => <section key={heading}><h2 className="font-serif text-3xl">{heading}</h2><p className="mt-3 leading-7 text-[#24201d]/70">{body}</p></section>)}
      </div>
      <Link href="/blog" className="mt-10 inline-flex rounded-full bg-[#d99a2b] px-5 py-3 text-sm font-bold text-white">Back to journal</Link>
    </article>
  </GenericPage>
}
