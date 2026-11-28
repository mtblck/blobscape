import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { inkStudioDev } from './scripts/ink-studio-dev.ts'

// Blobscape is its own site (blobscape.dev): served from the root. Every page is
// a folder with an index.html; scripts/prerender.ts then writes one for each of
// Blobscape's routes from the built front page.
const BASE = '/'

// The Ink Studio side-by-side page (dev/ink-compare/) is built only on Vercel previews or when asked
// (INK_COMPARE=1), never for production: scripts/ink-studio-preview.mjs puts Ink Studio beside it (the same test).
const INK_COMPARE = process.env.INK_COMPARE === '1' || (process.env.INK_COMPARE !== '0' && process.env.VERCEL_ENV === 'preview')

// `vite preview` sends the production headers from vercel.json, so the CSP
// (wasm-unsafe-eval, blob: workers) is enforced locally exactly as deployed.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'))
const previewHeaders: Record<string, string> = {}
for (const h of vercel.headers[0].headers) previewHeaders[h.key] = h.value

export default defineConfig({
  base: BASE,
  plugins: [react(), tailwindcss(), inkStudioDev()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: {
        blobscape: resolve(import.meta.dirname, 'index.html'),
        'fit-a-picture': resolve(import.meta.dirname, 'experiments/fit-a-picture/index.html'),
        'splat-to-sprite': resolve(import.meta.dirname, 'experiments/splat-to-sprite/index.html'),
        'engine-lab': resolve(import.meta.dirname, 'engine-lab/index.html'),
        ...(INK_COMPARE && { 'ink-compare': resolve(import.meta.dirname, 'dev/ink-compare/index.html') }),
      },
    },
  },
  preview: { headers: previewHeaders, port: 4180 },
})
