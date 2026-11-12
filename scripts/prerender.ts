/**
 * After `vite build`: writes an HTML file for every Blobscape page, so each
 * address is a real file with its own title, description, canonical link,
 * link-preview tags, structured data and readable content. Search engines and
 * link previews read that; in a browser the app starts and replaces the
 * content with the live page. Also writes 404.html, sitemap.xml and robots.txt.
 *
 * Run with node --experimental-strip-types (no JSX here: the content is plain
 * strings, and the Tailwind classes it uses are scanned via @source in theme.css).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LESSONS, LESSON_COUNT, LESSON_GOALS, PARTS, href, type Route } from '../src/blobscape/routes.ts'
import { EXPERIMENTS, EXPERIMENTS_INTRO, SITE } from '../src/blobscape/site.ts'
import { DESCRIPTION, pageMeta } from '../src/blobscape/meta.ts'
import { AXIS, BLOB, WORD } from '../src/shared/logoPaths.ts'

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const TOOLS = ['/experiments/fit-a-picture/', '/experiments/splat-to-sprite/']

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const url = (path: string) => SITE.origin + path
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

const LOGO = `<svg viewBox="0 0 1155.48 187.2" class="h-6 w-auto sm:h-7" role="img" aria-label="Blobscape home"><g transform="translate(-4 -80)"><path d="${BLOB}" fill="#f2553a" fill-rule="evenodd"/><path d="${AXIS}" fill="var(--c-logo-ink)"/></g><path d="${WORD}" fill="var(--c-logo-ink)"/></svg>`

const LINK = 'text-ink underline decoration-rule underline-offset-2 hover:text-accent'
const BUTTON = 'inline-flex min-h-11 items-center rounded-lg bg-accent px-5 font-medium text-paper no-underline transition-colors hover:bg-accent-ink'

/**
 * The app's header, as near as static HTML gets: the main links hide on a
 * phone and an invisible stand-in holds the Menu button's place, so nothing
 * jumps when the app takes over.
 */
function shell(main: string): string {
  const nav = [['Lessons', '/lessons/'], ['Sandbox', '/sandbox/'], ['Experiments', '/experiments/']]
    .map(([label, path]) => `<li><a href="${path}" class="rounded-full px-3 py-1.5 text-[0.9375rem] font-medium text-ink-muted no-underline hover:text-ink">${label}</a></li>`)
    .join('')
  return `<div class="flex min-h-dvh flex-col"><a href="#main" class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-paper focus:px-3 focus:py-2 focus:text-sm">Skip to content</a><header class="sticky top-0 z-30 border-b border-rule bg-paper"><div class="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4"><a href="/" class="-mx-1 shrink-0 rounded-md px-1 py-1.5">${LOGO}</a><div class="flex items-center gap-1"><nav aria-label="Main" class="max-md:hidden"><ul class="flex items-center gap-1">${nav}</ul></nav><span aria-hidden="true" class="invisible flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium"><span class="h-4.5 w-4.5"></span>Menu</span></div></div></header><main id="main" class="mx-auto w-full max-w-7xl flex-1 px-4 pb-16">${main}</main></div>`
}

function lessonList(from: number = 0, to: number = LESSONS.length): string {
  return `<ol start="${from + 1}" class="mt-3 flex flex-col gap-4">${LESSONS.slice(from, to)
    .map((l) => `<li><a href="${href({ page: 'lesson', id: l.id })}" class="font-display text-xl ${LINK}">${esc(l.title)}</a><p class="mt-1 text-ink-muted">${esc(l.summary)}</p></li>`)
    .join('')}</ol>`
}

function crumbs(here: string, parent?: [string, string]): string {
  const up = parent ? `<a href="${parent[1]}" class="${LINK}">${esc(parent[0])}</a><span aria-hidden="true" class="px-1.5">/</span>` : ''
  return `<nav aria-label="Breadcrumb" class="pt-6 text-sm text-ink-faint"><a href="/" class="${LINK}">Blobscape</a><span aria-hidden="true" class="px-1.5">/</span>${up}<span aria-current="page">${esc(here)}</span></nav>`
}

function content(route: Route): string {
  switch (route.page) {
    case 'home':
      return `<div class="max-w-3xl py-12"><h1 class="font-display text-5xl leading-[1.05]">Learn 3D splats by taking them apart</h1>
<p class="mt-6 text-xl leading-relaxed text-ink-muted">A Gaussian splat is a 3D scene made of nothing but soft, coloured, see-through blobs. Learn what one blob is, then pile up thousands and pull real scenes to pieces.</p>
<p class="mt-6"><a href="${href({ page: 'lesson', id: LESSONS[0].id })}" class="${BUTTON}">Start with one blob</a></p>
<h2 class="mt-12 font-display text-3xl">${cap(LESSON_COUNT)} lessons, from one blob to a walking creature</h2>${lessonList()}
<h2 class="mt-12 font-display text-3xl">Sandbox</h2><p class="mt-2 text-ink-muted">Spray, select, move, recolour and explode blobs, or open your own .ply, .spz, .splat, .ksplat or .sog capture. <a href="/sandbox/" class="${LINK}">Open the sandbox</a></p>
<h2 id="experiments" class="mt-12 scroll-mt-20 font-display text-3xl">Other ways to play with splats</h2><ul class="mt-3 flex flex-col gap-4">${EXPERIMENTS.map((e) => `<li><a href="${e.url}" class="font-display text-xl ${LINK}">${esc(e.title)}</a><p class="mt-1 text-ink-muted">${esc(e.body)}</p></li>`).join('')}</ul><p class="mt-6"><a href="/experiments/" class="${LINK}">See every experiment</a></p></div>`
    case 'lessons':
      return `<div class="max-w-3xl">${crumbs('Lessons')}<h1 class="pt-6 font-display text-5xl">Lessons</h1>
<p class="mt-4 text-xl leading-relaxed text-ink-muted">A Gaussian splat is a 3D scene made of nothing but soft, see-through, coloured blobs. Start with one, learn what each of its numbers does, pile up thousands, then give them bones and make them walk.</p>
${PARTS.map((p, i) => `<h2 class="mt-10 font-display text-2xl">Part ${i + 1}: ${esc(p.title)}</h2><p class="mt-1 text-ink-muted">${esc(p.summary)}</p>${lessonList(p.from, PARTS[i + 1]?.from ?? LESSONS.length)}`).join('')}</div>`
    case 'lesson': {
      const i = LESSONS.findIndex((l) => l.id === route.id)
      const l = LESSONS[i]
      const prev = LESSONS[i - 1]
      const next = LESSONS[i + 1]
      return `<div class="max-w-3xl">${crumbs(`Lesson ${i + 1}`)}<p class="pt-6 text-sm font-semibold tracking-wider text-ink-faint uppercase">Lesson ${i + 1} of ${LESSONS.length}</p>
<h1 class="mt-1 font-display text-4xl">${esc(l.title)}</h1><p class="mt-3 text-lg text-ink-muted">${esc(l.summary)}</p>
<h2 class="mt-8 font-display text-2xl">Goals</h2><ul class="mt-2 list-disc pl-5 text-ink-muted">${LESSON_GOALS[l.id].map((g) => `<li>${esc(g.label)}</li>`).join('')}</ul>
<p class="mt-8 text-sm text-ink-faint">This lesson draws live blobs in your browser, with JavaScript and WebGL.</p>
<nav aria-label="Lessons" class="mt-8 flex flex-wrap gap-6">${prev ? `<a href="${href({ page: 'lesson', id: prev.id })}" class="${LINK}">← ${i}. ${esc(prev.title)}</a>` : ''}<a href="/lessons/" class="${LINK}">All lessons</a>${next ? `<a href="${href({ page: 'lesson', id: next.id })}" class="${LINK}">${i + 2}. ${esc(next.title)} →</a>` : ''}</nav></div>`
    }
    case 'sandbox':
    case 'creature':
    case 'forest': {
      const title = route.page === 'sandbox' ? 'Sandbox' : route.page === 'creature' ? 'Splat Creatures' : 'Forest Walk'
      const tool = route.page !== 'sandbox'
      return `<div class="max-w-3xl">${crumbs(title, tool ? ['Experiments', '/experiments/'] : undefined)}<h1 class="pt-6 font-display text-5xl">${title}</h1><p class="mt-4 text-xl leading-relaxed text-ink-muted">${esc(pageMeta(route).description)}</p><p class="mt-6 text-sm text-ink-faint">It runs in your browser, with JavaScript and WebGL${tool ? ' or WebGPU' : ''}.</p></div>`
    }
    case 'experiments':
      return `${crumbs('Experiments')}<div class="max-w-3xl pt-6 pb-8"><h1 class="font-display text-5xl">Experiments</h1>
<p class="mt-4 text-xl leading-relaxed text-ink-muted">${esc(EXPERIMENTS_INTRO)}</p></div>
<ul class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">${EXPERIMENTS.map((e) => `<li><a href="${e.url}" class="group flex h-full flex-col gap-4 rounded-2xl border border-rule bg-paper p-4 no-underline transition-colors hover:border-ink-faint"><span aria-hidden="true" class="block aspect-[240/130] w-full rounded-xl bg-[#14161f] ring-1 ring-rule"></span><span class="font-display text-2xl text-ink group-hover:text-accent">${esc(e.title)} →</span><span class="flex-1 text-ink-muted">${esc(e.body)}</span><span class="text-sm text-ink-faint">Needs ${esc(e.needs)}. Runs in your browser; nothing is uploaded.</span></a></li>`).join('')}</ul>
<p class="mt-10 text-ink-muted">New to splats? The <a href="/lessons/" class="text-ink underline underline-offset-2 hover:text-accent">lessons</a> start with a single blob.</p>`
    case 'notfound':
      return `<div class="max-w-2xl py-16"><h1 class="font-display text-5xl">That page isn’t here</h1><p class="mt-4 text-xl leading-relaxed text-ink-muted">The link may be old, or mistyped. Every lesson is on the lesson list.</p><p class="mt-8"><a href="/lessons/" class="${BUTTON}">See the lessons</a></p></div>`
  }
}

const PERSON = { '@type': 'Person', name: SITE.author.name, url: SITE.author.url }
const COURSE = {
  '@type': 'Course',
  '@id': url('/lessons/#course'),
  name: `${SITE.name}: Gaussian splats, one blob at a time`,
  description: DESCRIPTION,
  url: url('/lessons/'),
  isAccessibleForFree: true,
  inLanguage: 'en',
  provider: PERSON,
  hasCourseInstance: { '@type': 'CourseInstance', courseMode: 'online', courseWorkload: `PT${LESSONS.length * 5}M` },
  hasPart: LESSONS.map((l, i) => ({ '@type': 'LearningResource', position: i + 1, name: l.title, url: url(href({ page: 'lesson', id: l.id })) })),
}

function breadcrumbs(items: [string, string][]) {
  return { '@type': 'BreadcrumbList', itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: url(path) })) }
}

function structured(route: Route): object[] {
  const home: [string, string] = [SITE.name, '/']
  switch (route.page) {
    case 'home':
      return [{ '@type': 'WebSite', name: SITE.name, url: url('/'), description: DESCRIPTION, author: PERSON }, COURSE]
    case 'lessons':
      return [COURSE, breadcrumbs([home, ['Lessons', '/lessons/']])]
    case 'lesson': {
      const i = LESSONS.findIndex((l) => l.id === route.id)
      const l = LESSONS[i]
      return [
        { '@type': 'LearningResource', name: l.title, description: l.summary, url: url(href(route)), position: i + 1, learningResourceType: 'interactive lesson', isAccessibleForFree: true, inLanguage: 'en', isPartOf: { '@id': COURSE['@id'] }, author: PERSON },
        breadcrumbs([home, ['Lessons', '/lessons/'], [l.title, href(route)]]),
      ]
    }
    case 'sandbox':
      return [breadcrumbs([home, ['Sandbox', href(route)]])]
    case 'experiments':
      return [
        { '@type': 'ItemList', name: 'Blobscape experiments', itemListElement: EXPERIMENTS.map((e, i) => ({ '@type': 'ListItem', position: i + 1, name: e.title, url: url(e.url) })) },
        breadcrumbs([home, ['Experiments', '/experiments/']]),
      ]
    case 'creature':
      return [breadcrumbs([home, ['Experiments', '/experiments/'], ['Splat Creatures', href(route)]])]
    case 'forest':
      return [breadcrumbs([home, ['Experiments', '/experiments/'], ['Forest Walk', href(route)]])]
    default:
      return []
  }
}

/** Swaps one tag's attribute value, failing loudly if the template lost the tag. */
function setAttr(html: string, tag: RegExp, value: string): string {
  if (!tag.test(html)) throw new Error(`prerender: the built page has no ${tag}`)
  // Function replacements throughout, so a $ in a title can't be read as a replacement pattern
  return html.replace(tag, (m) => m.replace(/(content|href)="[^"]*"/, (_, attr) => `${attr}="${esc(value)}"`))
}

function render(template: string, route: Route): string {
  const meta = pageMeta(route)
  let html = template.replace(/<title>[^<]*<\/title>/, () => `<title>${esc(meta.title)}</title>`)
  html = setAttr(html, /<meta name="description"[^>]*>/, meta.description)
  html = setAttr(html, /<meta property="og:title"[^>]*>/, meta.title)
  html = setAttr(html, /<meta property="og:description"[^>]*>/, meta.description)
  if (meta.path) {
    html = setAttr(html, /<link rel="canonical"[^>]*>/, url(meta.path))
    html = setAttr(html, /<meta property="og:url"[^>]*>/, url(meta.path))
  } else {
    // The not-found page: nothing to point at, and nothing to index
    html = html.replace(/\s*<link rel="canonical"[^>]*>/, '').replace(/\s*<meta property="og:url"[^>]*>/, '')
    html = html.replace('</title>', '</title>\n    <meta name="robots" content="noindex" />')
  }
  const data = structured(route)
  if (data.length) {
    // JSON-LD is data, so the CSP's script-src doesn't apply; escape < so it can't close the tag
    const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': data }).replace(/</g, '\\u003c')
    html = html.replace('</head>', () => `  <script type="application/ld+json">${json}</script>\n  </head>`)
  }
  const root = /<div id="root">[\s\S]*?<\/div>(?=\s*<\/body>|\s*<script)/
  if (!root.test(html)) throw new Error('prerender: the built page has no #root')
  return html.replace(root, () => `<div id="root">${shell(content(route))}</div>`)
}

function write(path: string, html: string) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, html)
}

const template = readFileSync(join(DIST, 'index.html'), 'utf8')
const routes: Route[] = [{ page: 'home' }, { page: 'lessons' }, ...LESSONS.map((l) => ({ page: 'lesson' as const, id: l.id })), { page: 'sandbox' }, { page: 'experiments' }, { page: 'creature' }, { page: 'forest' }]
for (const r of routes) write(join(DIST, href(r), 'index.html'), render(template, r))
write(join(DIST, '404.html'), render(template, { page: 'notfound' }))

const today = new Date().toISOString().slice(0, 10)
const paths = [...routes.map(href), ...TOOLS]
write(
  join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((p) => `  <url><loc>${url(p)}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`,
)
// Nothing disallowed: the engine lab carries its own noindex, which crawlers only see if they may fetch it
write(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${url('/sitemap.xml')}\n`)
console.log(`prerender: ${routes.length} pages, 404.html, sitemap.xml (${paths.length} URLs), robots.txt`)
