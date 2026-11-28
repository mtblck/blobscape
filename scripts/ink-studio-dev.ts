/**
 * The dev server's half of the Ink Studio comparison (`dev/ink-compare/`): it serves a local build of Silicon
 * Jungle's Ink Studio (MIT; github.com/siliconjungle/shapeshift-labs-ink-studio) at `/ink-studio/`, read from the
 * folder `INK_STUDIO_DIR` names. Only `npm run dev` has it (`apply: 'serve'`): nothing of Ink Studio is in the repo,
 * and `vite build` never sees the folder or the page.
 *
 *   git clone https://github.com/siliconjungle/shapeshift-labs-ink-studio ../ink-studio
 *   (cd ../ink-studio && npm install && npm run build)
 *   INK_STUDIO_DIR=../ink-studio npm run dev    # then open /dev/ink-compare/
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import type { Plugin } from 'vite'

const TYPES: Record<string, string> = {
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.cjs': 'text/javascript', '.json': 'application/json',
  '.wasm': 'application/wasm', '.png': 'image/png', '.glsl': 'text/plain', '.wgsl': 'text/plain', '.bin': 'application/octet-stream',
}

/** The file under `root` that `/ink-studio/<path>` names, or undefined for anything outside it. */
export function inkFile(root: string, url: string): string | undefined {
  const path = decodeURIComponent(url.split('?')[0].replace(/^\/ink-studio\/?/, ''))
  const file = normalize(join(root, path))
  return file === root || file.startsWith(root + sep) ? file : undefined
}

export function inkStudioDev(): Plugin {
  return {
    name: 'blobscape:ink-studio-dev',
    apply: 'serve',
    configureServer(server) {
      const dir = process.env.INK_STUDIO_DIR
      const root = dir ? resolve(dir) : undefined
      if (root && !existsSync(join(root, 'webgl.mjs'))) server.config.logger.warn(`INK_STUDIO_DIR (${root}) holds no webgl.mjs: the Ink Studio comparison won't load`)
      server.middlewares.use('/ink-studio', (req, res, next) => {
        if (req.url === '/status.json' || req.url === '/status.json/') {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ dir: root ?? null, built: !!root && existsSync(join(root, 'dist/ink-studio.browser.js')), renderer: !!root && existsSync(join(root, 'webgl.mjs')) }))
          return
        }
        if (!root) { res.statusCode = 404; res.end('Set INK_STUDIO_DIR to a built Ink Studio clone'); return }
        const file = inkFile(root, '/ink-studio' + (req.url ?? '/'))
        if (!file || !existsSync(file) || !statSync(file).isFile()) return next()
        res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream')
        res.setHeader('Cache-Control', 'no-store')
        res.end(readFileSync(file))
      })
    },
  }
}
