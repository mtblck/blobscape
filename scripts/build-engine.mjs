// Builds the @blobscape/engine package into packages/engine/dist: one ES module (three.js left to the app, as a peer)
// and its type declarations. `npm run engine:build`. Publishing is a separate step, and waits on Matt's go.
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'vite'

const root = new URL('..', import.meta.url).pathname
const out = join(root, 'packages/engine/dist')
rmSync(out, { recursive: true, force: true })

await build({
  root,
  configFile: false,
  logLevel: 'error',
  publicDir: false,
  build: {
    outDir: out,
    emptyOutDir: false,
    sourcemap: true,
    minify: false,
    target: 'es2022',
    lib: { entry: join(root, 'src/splat-engine/index.ts'), formats: ['es'], fileName: () => 'index.js' },
    rollupOptions: { external: (id) => id === 'three' || id.startsWith('three/') },
  },
})

// declarations, with their imports pointing at .js so any TypeScript setup finds the .d.ts beside them
execFileSync(join(root, 'node_modules/.bin/tsc'), ['-p', join(root, 'tsconfig.engine.json')], { stdio: 'inherit' })
const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p] })
for (const f of walk(join(out, 'types')).filter((f) => f.endsWith('.d.ts'))) {
  writeFileSync(f, readFileSync(f, 'utf8').replace(/(from\s+|import\()(['"])(\.{1,2}\/[^'"]+)\.ts\2/g, '$1$2$3.js$2'))
}
const kb = (f) => `${Math.round(statSync(join(out, f)).size / 1024)} kB`
console.log(`@blobscape/engine built: dist/index.js ${kb('index.js')}`)
