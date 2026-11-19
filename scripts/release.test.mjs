import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readdirSync, readFileSync } from 'node:fs'
import { cutRelease, ENTRY_NAME, entryOf, joinChanges, withVersion } from './release.mjs'

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

test('an entry file becomes a bullet, and one with bullets is kept', () => {
  assert.equal(entryOf('Snow drifts.\n'), '- Snow drifts.')
  assert.equal(entryOf('Snow drifts\nbehind walls.\n'), '- Snow drifts behind walls.')
  assert.equal(entryOf('- Snow drifts.\n- Engine: `drift`.\n'), '- Snow drifts.\n- Engine: `drift`.')
  assert.equal(entryOf(' \n'), '')
  assert.throws(() => entryOf('Snow.\n- More snow.'), /every entry/)
  assert.throws(() => entryOf('## Snow\n\nDrifts.'), /heading/)
})

test('entry files join newest first, ahead of what is still under [Unreleased]', () => {
  const files = [
    { name: 'older.md', text: 'Older.\n', time: 1 },
    { name: 'b-newest.md', text: 'B.\n', time: 3 },
    { name: 'a-newest.md', text: '- A.\n- A too.\n', time: 3 },
  ]
  const added = joinChanges(files)
  assert.equal(added, '- A.\n- A too.\n- B.\n- Older.')
  assert.throws(() => joinChanges([{ name: 'blank.md', text: '\n', time: 1 }]), /changes\/blank\.md is empty/)
  const once = cutRelease(first, '0.1.0', '2026-11-18')
  const kept = once.replace('## [Unreleased]\n', '## [Unreleased]\n\n- By hand.\n')
  assert.match(cutRelease(kept, '0.2.0', '2026-12-01', added), /## \[Unreleased\]\n\n## \[0\.2\.0\] - 2026-12-01\n\n- A\.\n- A too\.\n- B\.\n- Older\.\n- By hand\.\n\n## \[0\.1\.0\]/)
  // entry files alone are enough to release
  assert.match(cutRelease(once, '0.2.0', '2026-12-01', added), /## \[0\.2\.0\] - 2026-12-01\n\n- A\./)
})

test('every file waiting in changes/ is an entry the release can join', () => {
  const folder = new URL('../changes/', import.meta.url)
  const names = readdirSync(folder).filter((name) => name !== 'README.md')
  for (const name of names) assert.match(name, ENTRY_NAME, `changes/${name}: name it in lower-case words joined by hyphens, ending .md`)
  joinChanges(names.map((name) => ({ name, text: readFileSync(new URL(name, folder), 'utf8'), time: 0 })))
})

test("the engine package's manifest takes the release's version and keeps the rest", () => {
  const manifest = '{\n  "name": "@blobscape/engine",\n  "version": "0.1.0",\n  "private": true\n}\n'
  assert.equal(withVersion(manifest, '0.2.0'), manifest.replace('0.1.0', '0.2.0'))
  assert.throws(() => withVersion(manifest, '0.2'), /isn't a version/)
  assert.throws(() => withVersion('{ "name": "x" }', '0.2.0'), /no "version"/)
})
