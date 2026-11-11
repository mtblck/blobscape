import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Blobscape is its own site (blobscape.dev): served from the root. Every page is
// a folder with an index.html; scripts/prerender.ts then writes one for each of
// Blobscape's routes from the built front page.
const BASE = '/'

// `vite preview` sends the production headers from vercel.json, so the CSP
// (wasm-unsafe-eval, blob: workers) is enforced locally exactly as deployed.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'))
const previewHeaders: Record<string, string> = {}
for (const h of vercel.headers[0].headers) previewHeaders[h.key] = h.value

export default defineConfig({
  base: BASE,
  plugins: [react(), tailwindcss()],
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
      },
    },
  },
  preview: { headers: previewHeaders, port: 4180 },
})
