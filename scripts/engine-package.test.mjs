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

test('the package manifest is publishable (Matt said go, 2026-11-17), and three.js is a peer', () => {
  const pkg = JSON.parse(readFileSync(resolve(root, 'packages/engine/package.json'), 'utf8'))
  assert.equal(pkg.name, '@blobscape/engine')
  assert.ok(!pkg.private)
  assert.ok(pkg.peerDependencies.three)
  assert.ok(!pkg.dependencies)
  // one version for the site and the package: `npm run release` sets both, and the release workflow publishes it
  assert.equal(pkg.version, JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version)
  assert.equal(pkg.publishConfig?.access, 'public')
})

test("the engine lessons' take-away code compiles against the package", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { execFileSync } = await import('node:child_process')
  const { lessonCodes } = await import('../src/blobscape/build/codes.ts')
  const dir = mkdtempSync(resolve(tmpdir(), 'lesson-code-'))
  try {
    const codes = lessonCodes()
    for (const c of codes) writeFileSync(resolve(dir, `${c.name}.ts`), `${c.source}\nexport {}\n`)
    writeFileSync(resolve(dir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', strict: true, noEmit: true, skipLibCheck: true,
        allowImportingTsExtensions: true, lib: ['ES2023', 'DOM'], types: [],
        // the package's entry as source: its own imports (three.js) resolve from the repo
        paths: { '@blobscape/engine': [resolve(root, 'src/splat-engine/index.ts')] },
      },
      files: codes.map((c) => `${c.name}.ts`),
    }))
    try {
      execFileSync(resolve(root, 'node_modules/.bin/tsc'), ['-p', dir], { encoding: 'utf8' })
    } catch (e) {
      assert.fail(`the lessons' code doesn't compile:\n${e.stdout}`)
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
