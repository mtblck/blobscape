// Fails the build if the hosting shape that the portfolio proxy relies on drifts.
import { readFileSync } from 'node:fs'
const fail = (m) => { console.error(`hosting:check: ${m}`); process.exit(1) }
const v = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
const vite = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8')
if (v.outputDirectory !== 'dist') fail('outputDirectory must be "dist" (files live at dist/experiments/...)')
if (!/BASE = '\/experiments\/'/.test(vite)) fail("vite base must be '/experiments/'")
if (!vite.includes("outDir: 'dist/experiments'")) fail("vite outDir must be 'dist/experiments'")
for (const k of ['cleanUrls', 'trailingSlash', 'routes']) if (k in v) fail(`"${k}" breaks the /experiments/ proxy; remove it`)
const block = v.headers?.find((h) => h.source === '/experiments/(.*)')
const csp = block?.headers.find((h) => h.key === 'Content-Security-Policy')?.value ?? ''
if (!csp.includes("'wasm-unsafe-eval'")) fail("CSP script-src needs 'wasm-unsafe-eval' (Spark decodes splats in WASM)")
if (!/worker-src [^;]*blob:/.test(csp)) fail('CSP needs worker-src blob: (Spark sorts splats in a blob worker)')
// Every page: an entry in vite.config.ts, a no-slash redirect, and no inline scripts
const pages = [...vite.matchAll(/resolve\(__dirname, '([\w-]+)\/index\.html'\)/g)].map((m) => m[1])
for (const p of pages) {
  if (!v.redirects?.some((r) => r.source === `/experiments/${p}` && r.destination === `/experiments/${p}/`)) fail(`vercel.json needs a redirect from /experiments/${p} to /experiments/${p}/`)
}
for (const f of ['index.html', ...pages.map((p) => `${p}/index.html`)]) {
  const html = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
  if (/<script(?![^>]*\bsrc=)[^>]*>/.test(html)) fail(`${f} has an inline script; the CSP is script-src 'self'`)
}
console.log('hosting:check ok')
