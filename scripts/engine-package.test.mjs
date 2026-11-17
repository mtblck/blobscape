// The @blobscape/engine package's entry reaches only the engine, splat-core and three.js when it runs: no Spark, no
// site code (pages, React, shared UI). Type-only imports don't count, since they leave nothing in the build.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

const root = resolve(new URL('..', import.meta.url).pathname)

function graph(entry) {
  const files = new Set(), outside = new Set()
  const walk = (f) => {
    if (files.has(f)) return
    files.add(f)
    const src = readFileSync(f, 'utf8')
    for (const m of src.matchAll(/^\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/gm)) {
      if (m[2] || /^\{\s*type\s/.test(m[3] ?? '') && !/,\s*(?!type\s)\w/.test(m[3])) continue
      const spec = m[4] ?? m[5]
      if (spec.startsWith('.')) walk(resolve(dirname(f), spec))
      else outside.add(spec)
    }
  }
  walk(entry)
  return { files: [...files].map((f) => relative(root, f)), outside: [...outside] }
}

test('the engine package runs on three.js alone, with no Spark and no site code', () => {
  const { files, outside } = graph(resolve(root, 'src/splat-engine/index.ts'))
  assert.deepEqual(outside.filter((s) => s !== 'three' && !s.startsWith('three/')), [])
  const site = files.filter((f) => !/^src\/(splat-engine|splat-core|splat-to-sprite)\//.test(f))
  assert.deepEqual(site, [])
  assert.ok(files.length > 30, `only ${files.length} files reached`)
})

test('the package manifest stays unpublishable until Matt says go, and three.js is a peer', () => {
  const pkg = JSON.parse(readFileSync(resolve(root, 'packages/engine/package.json'), 'utf8'))
  assert.equal(pkg.name, '@blobscape/engine')
  assert.equal(pkg.private, true)
  assert.ok(pkg.peerDependencies.three)
  assert.ok(!pkg.dependencies)
})
