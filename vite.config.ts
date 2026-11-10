import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Every experiment lives under /experiments/<name>/ on both this project's own
// domain and mattblack.space, so the portfolio can proxy the whole prefix with
// one rewrite and every asset URL works unchanged on either host.
const BASE = '/experiments/'

// `vite preview` sends the production headers from vercel.json, so the CSP
// (wasm-unsafe-eval, blob: workers) is enforced locally exactly as deployed.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'))
const previewHeaders: Record<string, string> = {}
for (const h of vercel.headers[0].headers) previewHeaders[h.key] = h.value

export default defineConfig({
  base: BASE,
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist/experiments',
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: {
        hub: resolve(__dirname, 'index.html'),
        'splat-to-sprite': resolve(__dirname, 'splat-to-sprite/index.html'),
      },
    },
  },
  preview: { headers: previewHeaders, port: 4180 },
})
