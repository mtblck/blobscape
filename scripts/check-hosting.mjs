// Fails the build if the hosting shape blobscape.dev relies on drifts.
import { readFileSync } from 'node:fs'
const fail = (m) => { console.error(`hosting:check: ${m}`); process.exit(1) }
const v = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
const vite = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8')
if (v.outputDirectory !== 'dist') fail('outputDirectory must be "dist"')
if (!/BASE = '\/'/.test(vite)) fail("vite base must be '/' (the site is served from the root)")
if (!vite.includes("outDir: 'dist'")) fail("vite outDir must be 'dist'")
// Every page is a folder with an index.html, so its address ends in a slash
if (v.trailingSlash !== true) fail('"trailingSlash" must be true: pages are folders (/lessons/one-blob/)')
for (const k of ['cleanUrls', 'routes', 'rewrites']) if (k in v) fail(`"${k}" isn't needed: every page is a prerendered file; remove it`)
const block = v.headers?.find((h) => h.source === '/(.*)')
const csp = block?.headers.find((h) => h.key === 'Content-Security-Policy')?.value ?? ''
if (!csp.includes("'wasm-unsafe-eval'")) fail("CSP script-src needs 'wasm-unsafe-eval' (Spark decodes splats in WASM)")
if (!/worker-src [^;]*blob:/.test(csp)) fail('CSP needs worker-src blob: (Spark sorts splats in a blob worker)')
// Old mattblack.space/experiments/ addresses (proxied here by the portfolio) go to blobscape.dev.
// Absolute, so the redirect reaches the visitor as blobscape.dev, not as a path on mattblack.space
for (const p of ['/experiments/blobscape/:path*', '/experiments/fit-a-picture/:path*', '/experiments/splat-to-sprite/:path*']) {
  if (!v.redirects?.some((r) => r.source === p && r.destination.startsWith('https://blobscape.dev/'))) fail(`vercel.json needs a redirect from ${p} to https://blobscape.dev/…`)
}
// Every page: no inline scripts
const pages = [...vite.matchAll(/resolve\(import.meta.dirname, '([\w/-]+\.html)'\)/g)].map((m) => m[1])
if (pages.length < 2) fail('found no pages in vite.config.ts')
for (const f of pages) {
  const html = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
  // JSON-LD is data, not code, so the CSP doesn't apply to it
  if (/<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>/.test(html)) fail(`${f} has an inline script; the CSP is script-src 'self'`)
}
console.log('hosting:check ok')
