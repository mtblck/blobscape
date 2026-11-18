// Builds the @blobscape/engine package into packages/engine/dist: ES modules (three.js left to the app, as a peer),
// their type declarations, and the <blobscape-creature> element as one file with three.js inside. `npm run engine:build`. Publishing is a separate step, and waits on Matt's go.
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'vite'
import { ELEMENT_FILE, buildElement } from './build-element.mjs'

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
    // two doors, sharing the engine between them: the API, and the <blobscape-creature> element built on it
    lib: { entry: { index: join(root, 'src/splat-engine/index.ts'), element: join(root, 'src/splat-engine/element.ts') }, formats: ['es'], fileName: (_format, name) => `${name}.js` },
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
// and the element as one file with three.js inside, for a plain script tag
await buildElement(out)
console.log(`@blobscape/engine built: ${readdirSync(out).filter((f) => f.endsWith('.js')).map((f) => `dist/${f} ${kb(f)}`).join(', ')}`)
