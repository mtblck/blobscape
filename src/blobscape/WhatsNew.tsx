import { href } from './routes.ts'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { mdToHtml } from './markdown.ts'
import { NEWS, POSTS, neighbors, postById, postText, type Post } from './news.ts'
import { SITE, longDate } from './site.ts'

const postHref = (p: Post) => href({ page: 'post', id: p.id })
const LINK = 'text-ink underline underline-offset-2 hover:text-accent'

/** The day a post is about, and the release it is about if it is one. */
function PostDate({ p }: { p: Post }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-faint">
      <time dateTime={p.date}>{longDate(p.date)}</time>
      {p.version && <span className="rounded-full border border-rule px-2.5 py-0.5 text-xs font-medium text-ink-muted">Release {p.version}</span>}
    </p>
  )
}

/** A post's picture: 16:10, whatever shape the file is. */
function Picture({ p, lazy }: { p: Post; lazy?: boolean }) {
  return <img src={p.image.src} alt={p.image.alt} width={1200} height={750} loading={lazy ? 'lazy' : undefined} decoding="async" className="block aspect-[16/10] h-auto w-full rounded-xl object-cover ring-1 ring-rule" />
}

/** What's New: every post, newest first, each a picture, a day, a title and a few sentences. */
export function WhatsNew() {
  const h1 = useFocusHeading()
  return (
    <div className="max-w-4xl">
      <Crumbs here="What's New" />
      <div className="max-w-3xl pt-6 pb-4">
        <h1 ref={h1} tabIndex={-1} className="font-display text-5xl outline-none">{NEWS.title}</h1>
        <p className="mt-4 text-xl leading-relaxed text-ink-muted">{NEWS.intro}</p>
      </div>
      <ol reversed data-testid="post-list">
        {POSTS.map((p, i) => (
          <li key={p.id} className="border-t border-rule py-8 first:border-t-0">
            <article className="relative grid gap-x-8 gap-y-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:items-start">
              {/* the title is the link, and it covers the whole post; the picture is described on the post's own page */}
              <img src={p.image.src} alt="" width={1200} height={750} loading={i > 1 ? 'lazy' : undefined} decoding="async" className="block aspect-[16/10] h-auto w-full rounded-xl object-cover ring-1 ring-rule" />
              <div className="flex flex-col gap-3">
                <PostDate p={p} />
                <h2 className="font-display text-3xl leading-tight">
                  <a href={postHref(p)} className="text-ink no-underline after:absolute after:inset-0 after:rounded-xl hover:text-accent focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-4 focus-visible:after:outline-accent">{p.title}</a>
                </h2>
                <p className="text-ink-muted">{p.summary}</p>
                <p aria-hidden className="text-sm font-medium text-accent">Read the post →</p>
              </div>
            </article>
          </li>
        ))}
      </ol>
      <p className="mt-4 border-t border-rule pt-6 text-ink-muted">
        Every change, small ones too, is in the <a href={`${SITE.repo}/blob/main/CHANGELOG.md`} className={LINK}>changelog</a>. To follow along in a reader, there is a <a href={NEWS.feed} className={LINK}>feed</a>.
      </p>
    </div>
  )
}

/** One post: its day, its picture and its words, then the posts either side of it. */
export function PostPage({ id }: { id: string }) {
  const h1 = useFocusHeading()
  const p = postById(id)!
  const { newer, older } = neighbors(id)
  return (
    <article className="max-w-3xl pb-8">
      <Crumbs here={p.title} parent={{ label: "What's New", href: href({ page: 'news' }) }} />
      <div className="pt-6">
        <PostDate p={p} />
        <h1 ref={h1} tabIndex={-1} className="mt-3 font-display text-4xl leading-tight outline-none sm:text-5xl">{p.title}</h1>
      </div>
      <div className="mt-6"><Picture p={p} /></div>
      <div className="spec" data-testid="post" dangerouslySetInnerHTML={{ __html: mdToHtml(postText(p)) }} />
      <nav aria-label="More posts" className="mt-12 grid gap-4 border-t border-rule pt-6 sm:grid-cols-2">
        {older ? <Step label="Earlier" p={older} /> : <span />}
        {newer ? <Step label="Later" p={newer} right /> : <span />}
        <a href={href({ page: 'news' })} className={`${LINK} sm:col-span-2`}>All posts</a>
      </nav>
    </article>
  )
}

function Step({ label, p, right }: { label: string; p: Post; right?: boolean }) {
  return (
    <a href={postHref(p)} className={`group flex flex-col gap-1 rounded-xl border border-rule p-4 no-underline transition-colors hover:border-ink-faint ${right ? 'sm:text-right' : ''}`}>
      <span className="text-sm text-ink-faint">{right ? `${label} →` : `← ${label}`}</span>
      <span className="font-display text-xl text-ink group-hover:text-accent">{p.title}</span>
    </a>
  )
}
