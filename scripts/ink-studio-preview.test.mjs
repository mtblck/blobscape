import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { reached, wanted } from './ink-studio-preview.mjs'

test('only previews, or a build that asks, carry Ink Studio', () => {
  assert.equal(wanted({ VERCEL_ENV: 'production' }), false)
  assert.equal(wanted({}), false)
  assert.equal(wanted({ VERCEL_ENV: 'preview' }), true)
  assert.equal(wanted({ VERCEL_ENV: 'preview', INK_COMPARE: '0' }), false)
  assert.equal(wanted({ INK_COMPARE: '1' }), true)
})

test('only the modules the renderer reaches are copied', () => {
  const root = mkdtempSync(join(tmpdir(), 'ink-reach-'))
  mkdirSync(join(root, 'src/webgl'), { recursive: true })
  writeFileSync(join(root, 'webgl.mjs'), "export { a } from './src/webgl/a.mjs';\nexport * from './src/b.mjs'")
  writeFileSync(join(root, 'src/webgl/a.mjs'), "import x from '../c.js';\nconst w = new URL('./w.mjs', import.meta.url);\nexport const a = () => import('./d.mjs')")
  for (const f of ['src/b.mjs', 'src/c.js', 'src/webgl/w.mjs', 'src/webgl/d.mjs', 'src/unused.mjs']) writeFileSync(join(root, f), "import t from 'three'")
  assert.deepEqual(reached(root, ['webgl.mjs']).sort(), ['src/b.mjs', 'src/c.js', 'src/webgl/a.mjs', 'src/webgl/d.mjs', 'src/webgl/w.mjs', 'webgl.mjs'])
})
