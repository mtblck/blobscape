import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cutRelease, withVersion } from './release.mjs'

const REPO = 'https://github.com/mtblck/blobscape'
const first = '# Changelog\n\nIntro.\n\n## [Unreleased]\n\nThe first one.\n\n### Lessons\n\n- One blob.\n'

test('a first release moves the entries and links to its release page', () => {
  const out = cutRelease(first, '0.1.0', '2026-11-18')
  assert.match(out, /## \[Unreleased\]\n\n## \[0\.1\.0\] - 2026-11-18\n\nThe first one\.\n\n### Lessons\n\n- One blob\.\n/)
  assert.ok(out.endsWith(`[Unreleased]: ${REPO}/compare/v0.1.0...HEAD\n[0.1.0]: ${REPO}/releases/tag/v0.1.0\n`))
})

test('a later release compares with the one before and keeps older sections', () => {
  const once = cutRelease(first, '0.1.0', '2026-11-18')
  const more = once.replace('## [Unreleased]\n', '## [Unreleased]\n\n- Snow drifts.\n')
  const out = cutRelease(more, '0.2.0', '2026-12-01')
  assert.match(out, /## \[0\.2\.0\] - 2026-12-01\n\n- Snow drifts\.\n\n## \[0\.1\.0\] - 2026-11-18\n\nThe first one\./)
  assert.match(out, new RegExp(`^\\[Unreleased\\]: ${REPO}/compare/v0\\.2\\.0\\.\\.\\.HEAD$`, 'm'))
  assert.match(out, new RegExp(`^\\[0\\.2\\.0\\]: ${REPO}/compare/v0\\.1\\.0\\.\\.\\.v0\\.2\\.0$`, 'm'))
  assert.match(out, new RegExp(`^\\[0\\.1\\.0\\]: ${REPO}/releases/tag/v0\\.1\\.0$`, 'm'))
})

test('refuses a bad version, a repeat or nothing to release', () => {
  assert.throws(() => cutRelease(first, 'v0.1', '2026-11-18'), /isn't a version/)
  const once = cutRelease(first, '0.1.0', '2026-11-18')
  assert.throws(() => cutRelease(once, '0.1.0', '2026-11-19'), /already has/)
  assert.throws(() => cutRelease(once, '0.2.0', '2026-11-19'), /nothing to release/)
})

test("the engine package's manifest takes the release's version and keeps the rest", () => {
  const manifest = '{\n  "name": "@blobscape/engine",\n  "version": "0.1.0",\n  "private": true\n}\n'
  assert.equal(withVersion(manifest, '0.2.0'), manifest.replace('0.1.0', '0.2.0'))
  assert.throws(() => withVersion(manifest, '0.2'), /isn't a version/)
  assert.throws(() => withVersion('{ "name": "x" }', '0.2.0'), /no "version"/)
})
