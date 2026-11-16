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
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'vite'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LESSONS, LESSON_GOALS, href, type Route } from '../src/blobscape/routes.ts'
import { EXPERIMENTS, SITE, byPublished, experimentAt, longDate, type Experiment } from '../src/blobscape/site.ts'
import { DESCRIPTION, pageMeta } from '../src/blobscape/meta.ts'
import { BUILT_ON, ENGINE, ENGINE_BUILT } from '../src/blobscape/engineCopy.ts'
import { SPEC, specTitle } from '../src/blobscape/specCopy.ts'
import { AXIS, BLOB, WORD } from '../src/shared/logoPaths.ts'

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
/** The rigged-splat spec, which its page shows (Spec.tsx reads the same file through Vite). */
const SPEC_MD = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'rigged-splats.md'), 'utf8')
const TOOLS = ['/experiments/fit-a-picture/', '/experiments/splat-to-sprite/']

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const url = (path: string) => SITE.origin + path

const LOGO = `<svg viewBox="0 0 1155.48 187.2" class="h-6 w-auto sm:h-7" role="img" aria-label="Blobscape home"><g transform="translate(-4 -80)"><path d="${BLOB}" fill="#f2553a" fill-rule="evenodd"/><path d="${AXIS}" fill="var(--c-logo-ink)"/></g><path d="${WORD}" fill="var(--c-logo-ink)"/></svg>`

const LINK = 'text-ink underline decoration-rule underline-offset-2 hover:text-accent'

/**
 * The app's header, as near as static HTML gets: the main links hide on a
 * phone and an invisible stand-in holds the Menu button's place, so nothing
 * jumps when the app takes over.
 */
function shell(main: string): string {
  const nav = [['Lessons', '/lessons/'], ['Experiments', '/experiments/'], ['Sandbox', '/sandbox/'], ['Engine', '/engine/']]
    .map(([label, path]) => `<li><a href="${path}" class="rounded-full px-3 py-1.5 text-[0.9375rem] font-medium text-ink-muted no-underline hover:text-ink">${label}</a></li>`)
    .join('')
  return `<div class="flex min-h-dvh flex-col"><a href="#main" class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-paper focus:px-3 focus:py-2 focus:text-sm">Skip to content</a><header class="sticky top-0 z-30 border-b border-rule bg-paper"><div class="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4"><a href="/" class="-mx-1 shrink-0 rounded-md px-1 py-1.5">${LOGO}</a><div class="flex items-center gap-1"><nav aria-label="Main" class="max-md:hidden"><ul class="flex items-center gap-1">${nav}</ul></nav><span aria-hidden="true" class="invisible flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium"><span class="h-4.5 w-4.5"></span>Menu</span></div></div></header><main id="main" class="mx-auto w-full max-w-7xl flex-1 px-4 pb-16">${main}</main></div>`
}

/** When an experiment was published, and when it last changed if that was another day (as `Dates` in Shell.tsx). */
function dates(e: Experiment, testId?: string): string {
  const day = (d: string) => `<time datetime="${d}">${longDate(d)}</time>`
  return `<p class="text-sm text-ink-faint"${testId ? ` data-testid="${testId}"` : ''}>Published ${day(e.published)}${e.updated !== e.published ? ` · Updated ${day(e.updated)}` : ''}</p>`
}

function crumbs(here: string, parent?: [string, string]): string {
  const up = parent ? `<a href="${parent[1]}" class="${LINK}">${esc(parent[0])}</a><span aria-hidden="true" class="px-1.5">/</span>` : ''
  const dated = parent ? EXPERIMENTS.find((e) => e.title === here) : undefined
  return `<div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 pt-6 text-sm text-ink-faint"><nav aria-label="Breadcrumb"><a href="/" class="${LINK}">Blobscape</a><span aria-hidden="true" class="px-1.5">/</span>${up}<span aria-current="page">${esc(here)}</span></nav>${dated ? `<div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">${ENGINE_BUILT.includes(dated.id) ? `<a href="/engine/" class="${LINK}" data-testid="built-on">${BUILT_ON}</a>` : ''}${dates(dated, 'page-dates')}</div>` : ''}</div>`
}

/** A readable stand-in for a page that draws in WebGL, under the same header; the app replaces it. */
function content(route: Route): string {
  switch (route.page) {
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
    case 'forest':
    case 'clockwork':
    case 'shift':
    case 'diorama':
    case 'scan':
    case 'dungeon': {
      const title = route.page === 'sandbox' ? 'Sandbox' : route.page === 'creature' ? 'Splat Creatures' : route.page === 'clockwork' ? 'Clockwork' : route.page === 'shift' ? 'Shape Shifter' : route.page === 'diorama' ? 'Pixel Diorama' : route.page === 'scan' ? 'Scan Studio' : route.page === 'dungeon' ? 'Dungeon Run' : 'Forest Walk'
      const tool = route.page !== 'sandbox'
      return `${crumbs(title, tool ? ['Experiments', '/experiments/'] : undefined)}<div class="max-w-3xl"><h1 class="pt-6 font-display text-5xl">${title}</h1><p class="mt-4 text-xl leading-relaxed text-ink-muted">${esc(pageMeta(route).description)}</p><p class="mt-6 text-sm text-ink-faint">It runs in your browser, with JavaScript and WebGL${tool ? ' or WebGPU' : ''}.</p></div>`
    }
    default:
      // the rest are drawn by the app itself (FROM_APP)
      throw new Error(`prerender: no stand-in for ${route.page}`)
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

/** An experiment as a dated piece of work, so a search engine can read it like a post. */
function work(e: Experiment) {
  // a plain creative work: the app types want prices and ratings, which a free toy will never have
  return { '@type': 'CreativeWork', '@id': `${url(e.url)}#work`, name: e.title, description: e.body, url: url(e.url), image: url(e.cover), datePublished: e.published, dateModified: e.updated, learningResourceType: 'interactive experiment', isAccessibleForFree: true, inLanguage: 'en', author: PERSON }
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
        { '@type': 'ItemList', name: 'Blobscape experiments', itemListElement: byPublished('newest').map((e, i) => ({ '@type': 'ListItem', position: i + 1, name: e.title, url: url(e.url) })) },
        breadcrumbs([home, ['Experiments', '/experiments/']]),
      ]
    case 'creature':
      return [work(experimentAt(href(route))!), breadcrumbs([home, ['Experiments', '/experiments/'], ['Splat Creatures', href(route)]])]
    case 'forest':
      return [work(experimentAt(href(route))!), breadcrumbs([home, ['Experiments', '/experiments/'], ['Forest Walk', href(route)]])]
    case 'shift':
      return [work(experimentAt(href(route))!), breadcrumbs([home, ['Experiments', '/experiments/'], ['Shape Shifter', href(route)]])]
    case 'clockwork':
      return [work(experimentAt(href(route))!), breadcrumbs([home, ['Experiments', '/experiments/'], ['Clockwork', href(route)]])]
    case 'diorama':
      return [work(experimentAt(href(route))!), breadcrumbs([home, ['Experiments', '/experiments/'], ['Pixel Diorama', href(route)]])]
    case 'scan':
      return [work(experimentAt(href(route))!), breadcrumbs([home, ['Experiments', '/experiments/'], ['Scan Studio', href(route)]])]
    case 'dungeon':
      return [work(experimentAt(href(route))!), breadcrumbs([home, ['Experiments', '/experiments/'], ['Dungeon Run', href(route)]])]
    case 'engine':
      return [
        { '@type': 'SoftwareApplication', name: ENGINE.title, description: pageMeta(route).description, url: url(href(route)), applicationCategory: 'DeveloperApplication', operatingSystem: 'Any (web browser)', isAccessibleForFree: true, author: PERSON },
        breadcrumbs([home, ['Engine', href(route)]]),
      ]
    case 'spec':
      return [
        { '@type': 'TechArticle', headline: specTitle(SPEC_MD), description: SPEC.description, url: url(href(route)), author: PERSON },
        breadcrumbs([home, ['Engine', '/engine/'], [SPEC.crumb, href(route)]]),
      ]
    case 'contact':
      return [{ '@type': 'ContactPage', name: `Get in touch · ${SITE.name}`, url: url(href(route)) }, breadcrumbs([home, ['Get in touch', href(route)]])]
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
  // Pages the app draws without WebGL are prerendered from the app itself, so its first frame matches this one;
  // the rest get a readable stand-in under the same header
  if (FROM_APP.has(route.page)) return html.replace(root, () => `<div id="root" data-ssr>${renderPage(route)}</div>`)
  return html.replace(root, () => `<div id="root">${shell(content(route))}</div>`)
}

function write(path: string, html: string) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, html)
}

// The app, loaded the way Vite would for a server, to draw the pages in FROM_APP
const FROM_APP = new Set<Route['page']>(['home', 'lessons', 'experiments', 'contact', 'engine', 'spec', 'notfound'])
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const { renderPage } = (await vite.ssrLoadModule('/src/blobscape/ssr.tsx')) as typeof import('../src/blobscape/ssr.tsx')

// Both fonts start loading with the page instead of after the CSS, so text is drawn once, in its own font,
// rather than in a fallback that reflows when they arrive
const fonts = readdirSync(join(DIST, 'assets')).filter((f) => f.endsWith('.woff2'))
if (fonts.length !== 2) throw new Error(`prerender: expected the two fonts in dist/assets, found ${fonts.length}`)
const preloads = fonts.map((f) => `<link rel="preload" href="/assets/${f}" as="font" type="font/woff2" crossorigin>`).join('\n    ')
const built = readFileSync(join(DIST, 'index.html'), 'utf8')
if (!built.includes('<link rel="stylesheet"')) throw new Error('prerender: the built page has no stylesheet link')
const template = built.replace('<link rel="stylesheet"', () => `${preloads}\n    <link rel="stylesheet"`)
const routes: Route[] = [{ page: 'home' }, { page: 'lessons' }, ...LESSONS.map((l) => ({ page: 'lesson' as const, id: l.id })), { page: 'sandbox' }, { page: 'experiments' }, { page: 'creature' }, { page: 'forest' }, { page: 'clockwork' }, { page: 'shift' }, { page: 'diorama' }, { page: 'dungeon' }, { page: 'scan' }, { page: 'engine' }, { page: 'spec' }, { page: 'contact' }]
for (const r of routes) write(join(DIST, href(r), 'index.html'), render(template, r))
write(join(DIST, '404.html'), render(template, { page: 'notfound' }))

// The two tools are pages of their own (not the app), built by Vite: give each the same dated JSON-LD as the app's experiments
for (const path of TOOLS) {
  const file = join(DIST, path, 'index.html')
  const e = experimentAt(path)
  if (!e) throw new Error(`prerender: ${path} is not in EXPERIMENTS`)
  const html = readFileSync(file, 'utf8')
  if (html.includes('application/ld+json')) continue
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': [work(e), breadcrumbs([[SITE.name, '/'], ['Experiments', '/experiments/'], [e.title, path]])] }).replace(/</g, '\\u003c')
  write(file, html.replace('</head>', () => `  <script type="application/ld+json">${json}</script>\n  </head>`))
}

const today = new Date().toISOString().slice(0, 10)
const paths = [...routes.map(href), ...TOOLS]
write(
  join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((p) => `  <url><loc>${url(p)}</loc><lastmod>${experimentAt(p)?.updated ?? today}</lastmod></url>`).join('\n')}\n</urlset>\n`,
)
// Nothing disallowed: the engine lab carries its own noindex, which crawlers only see if they may fetch it
write(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${url('/sitemap.xml')}\n`)
console.log(`prerender: ${routes.length} pages, 404.html, sitemap.xml (${paths.length} URLs), robots.txt`)
await vite.close()
