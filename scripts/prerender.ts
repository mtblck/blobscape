/**
 * After `vite build`: writes an HTML file for every Blobscape page, so each
 * address is a real file with its own title, description, canonical link,
 * link-preview tags, structured data and the page as the app first draws it
 * (src/blobscape/ssr.tsx). Search engines and link previews read that; in a
 * browser the app starts on the same markup, so nothing moves. Also writes
 * 404.html, sitemap.xml and robots.txt.
 *
 * Run with node --experimental-strip-types (no JSX here: the app is loaded through Vite).
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'vite'
import { createElement, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LESSONS, href, type Route } from '../src/blobscape/routes.ts'
import { SITE, byPublished, experimentAt, type Experiment } from '../src/blobscape/site.ts'
import { DESCRIPTION, pageMeta } from '../src/blobscape/meta.ts'
import { ENGINE } from '../src/blobscape/engineCopy.ts'
import { SPEC, specTitle } from '../src/blobscape/specCopy.ts'
import { API_DATA_ID, API_PAGE } from '../src/blobscape/api/types.ts'

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
/** The rigged-splat spec, which its page shows (Spec.tsx reads the same file through Vite). */
const SPEC_MD = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'rigged-splats.md'), 'utf8')
const TOOLS = ['/experiments/fit-a-picture/', '/experiments/splat-to-sprite/']

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const url = (path: string) => SITE.origin + path

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
    case 'pond':
      return [work(experimentAt(href(route))!), breadcrumbs([home, ['Experiments', '/experiments/'], ['Wading Pond', href(route)]])]
    case 'shift':
      return [work(experimentAt(href(route))!), breadcrumbs([home, ['Experiments', '/experiments/'], ['Shape Shifter', href(route)]])]
    case 'daynight':
      return [work(experimentAt(href(route))!), breadcrumbs([home, ['Experiments', '/experiments/'], ['Day and Night', href(route)]])]
    case 'brush':
      return [work(experimentAt(href(route))!), breadcrumbs([home, ['Experiments', '/experiments/'], ['Brush and Ink', href(route)]])]
    case 'flow':
      return [work(experimentAt(href(route))!), breadcrumbs([home, ['Experiments', '/experiments/'], ['Sand, Snow and Goo', href(route)]])]
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
    case 'api':
      return [
        { '@type': 'TechArticle', headline: API_PAGE.title, description: API_PAGE.description, url: url(href(route)), author: PERSON },
        breadcrumbs([home, ['Engine', '/engine/'], [API_PAGE.crumb, href(route)]]),
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
  // Every page is prerendered from the app itself, so the first paint is the page the app then shows and nothing
  // jumps or changes size. Pages that draw no WebGL at first are marked data-ssr and picked up as they stand
  // (HYDRATED); the rest read the address and the browser as they start, so the app draws them afresh over this.
  // the API reference carries its data as JSON (not run, so the CSP allows it), so the page needn't load it again
  if (route.page === 'api') html = html.replace('</body>', () => `<script type="application/json" id="${API_DATA_ID}">${readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'blobscape', 'engineApi.json'), 'utf8').replace(/</g, '\\u003c').trim()}</script>\n  </body>`)
  if (HYDRATED.has(route.page)) return html.replace(root, () => `<div id="root" data-ssr>${renderPage(route)}</div>`)
  return html.replace(root, () => `${NO_SCRIPT}<div id="root">${renderPage(route)}</div>`)
}

function write(path: string, html: string) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, html)
}

// Said above a page whose view and controls do nothing without scripts (classes the app's own pages use, so they are in the CSS)
const NO_SCRIPT = '<noscript><p class="px-4 py-2 text-center text-sm text-ink-muted">This page draws live blobs in your browser, so it needs JavaScript.</p></noscript>'
// The app, loaded the way Vite would for a server, to draw every page. These are the ones the browser hydrates.
const HYDRATED = new Set<Route['page']>(['home', 'lessons', 'experiments', 'contact', 'engine', 'spec', 'api', 'notfound'])
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
const routes: Route[] = [{ page: 'home' }, { page: 'lessons' }, ...LESSONS.map((l) => ({ page: 'lesson' as const, id: l.id })), { page: 'sandbox' }, { page: 'experiments' }, { page: 'creature' }, { page: 'forest' }, { page: 'pond' }, { page: 'clockwork' }, { page: 'shift' }, { page: 'flow' }, { page: 'brush' }, { page: 'daynight' }, { page: 'diorama' }, { page: 'dungeon' }, { page: 'scan' }, { page: 'engine' }, { page: 'spec' }, { page: 'api' }, { page: 'contact' }]
for (const r of routes) write(join(DIST, href(r), 'index.html'), render(template, r))
write(join(DIST, '404.html'), render(template, { page: 'notfound' }))

// The two tools are pages of their own (not the app), built by Vite: give each the same dated JSON-LD as the app's experiments
for (const path of TOOLS) {
  const file = join(DIST, path, 'index.html')
  const e = experimentAt(path)
  if (!e) throw new Error(`prerender: ${path} is not in EXPERIMENTS`)
  let html = readFileSync(file, 'utf8')
  if (html.includes('application/ld+json')) continue
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': [work(e), breadcrumbs([[SITE.name, '/'], ['Experiments', '/experiments/'], [e.title, path]])] }).replace(/</g, '\\u003c')
  html = html.replace('</head>', () => `  <script type="application/ld+json">${json}</script>\n  </head>`)
  // and, like the app's pages, the fonts up front and the page as its own app first draws it (which then draws over it)
  const empty = /<div id="root">[\s\S]*?<\/div>(?=\s*<\/body>|\s*<script)/
  if (!html.includes('<link rel="stylesheet"') || !empty.test(html)) throw new Error(`prerender: ${path} has no stylesheet link or no #root`)
  const { App } = (await vite.ssrLoadModule(`/src${path.replace('/experiments', '').replace(/\/$/, '')}/App.tsx`)) as { App: () => ReactElement }
  html = html.replace('<link rel="stylesheet"', () => `${preloads}\n    <link rel="stylesheet"`).replace(empty, () => `${NO_SCRIPT}<div id="root">${renderToString(createElement(App))}</div>`)
  write(file, html)
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
