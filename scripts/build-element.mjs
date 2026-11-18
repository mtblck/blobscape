// Builds the <blobscape-creature> element as one file with three.js inside, for a plain <script type="module"> tag:
// no bundler, no import map. `node scripts/build-element.mjs` writes it into the built site (dist/embed/), where
// blobscape.dev serves it to any page; the engine package's build puts the same file in its dist.
import { statSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'vite'

const root = new URL('..', import.meta.url).pathname
export const ELEMENT_FILE = 'blobscape-creature.js'

/** Writes the one-file element into `outDir` and returns its size in bytes. */
export async function buildElement(outDir) {
  await build({
    root,
    configFile: false,
    logLevel: 'error',
    publicDir: false,
    build: {
      outDir,
      emptyOutDir: false,
      sourcemap: false,
      minify: true,
      target: 'es2022',
      lib: { entry: join(root, 'src/splat-engine/element.ts'), formats: ['es'], fileName: () => ELEMENT_FILE },
      // one file: the sprite baker the stage loads on demand comes along
      rollupOptions: { output: { codeSplitting: false } },
    },
  })
  return statSync(join(outDir, ELEMENT_FILE)).size
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const bytes = await buildElement(join(root, 'dist/embed'))
  console.log(`<blobscape-creature> built: dist/embed/${ELEMENT_FILE} ${Math.round(bytes / 1024)} kB`)
}
