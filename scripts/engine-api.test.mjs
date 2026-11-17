// The docs page shows src/blobscape/engineApi.json: it must say what the package's declarations say now.
// TypeDoc reads them, from its own small package (tools/api-docs, TypeScript 6): `npm run docs:deps` installs it,
// `npm run docs` writes the file. Without it installed this test is skipped; `npm run check` installs it first.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const tool = new URL('../tools/api-docs/', import.meta.url)
const installed = existsSync(new URL('node_modules/typedoc/package.json', tool))

test('the API reference is up to date with the package (else: npm run docs)', { skip: installed ? false : 'TypeDoc is not installed: npm run docs:deps' }, async () => {
  const { API_FILE, apiJson, buildApi } = await import(new URL('build.mjs', tool).href)
  const api = await buildApi()
  assert.equal(readFileSync(API_FILE, 'utf8'), apiJson(api), 'src/blobscape/engineApi.json is behind the code: run npm run docs')
  const all = api.modules.flatMap((m) => m.entries)
  const stage = all.find((e) => e.name === 'Stage')
  assert.ok(stage && stage.kind === 'class' && stage.methods.some((m) => m.name === 'setPixels' && /look\?: PixelLook/.test(m.signatures[0].code)), 'Stage is listed with its methods')
  assert.ok(!JSON.stringify(stage).includes('private'), 'Stage is listed without its private parts')
  assert.match(stage.doc, /front door/)
  for (const name of ['SplatWorld', 'Swing', 'compileScene', 'checkScene', 'buildVoxels', 'sculptToCount', 'writeRiggedGlb', 'makeFox', 'StageActor', 'Move']) assert.ok(all.some((e) => e.name === name), `${name} is missing`)
  assert.equal(new Set(all.map((e) => e.name)).size, all.length, 'a name is listed twice')
  // everything the docs show says what it is: a new export or member needs a doc comment, or `@internal` to leave the package's types
  const bare = all.flatMap((e) => [...(e.doc ? [] : [e.name]), ...[...(e.props ?? []), ...(e.methods ?? [])].filter((m) => !m.doc).map((m) => `${e.name}.${m.name}`)])
  assert.deepEqual(bare, [], 'these have no doc comment')
  // the parts: Core first, every module in one, and the modules of a part together on the page
  assert.equal(api.groups[0].id, 'core')
  assert.ok(api.modules.every((m) => api.groups.some((g) => g.id === m.group)), 'a module is in no part')
  assert.ok(api.groups.every((g) => g.doc && api.modules.some((m) => m.group === g.id)), 'a part is empty or says nothing')
  const run = api.modules.map((m) => m.group).filter((g, i, a) => g !== a[i - 1])
  assert.deepEqual(run, api.groups.map((g) => g.id), 'the modules are not in the order of their parts')
  assert.equal(api.modules[0].id, 'stage', 'the reference starts with Stage')
  assert.deepEqual(all.find((e) => e.name === 'CreatureStage'), { name: 'CreatureStage', kind: 'alias', doc: "The name the site's pages use.", of: 'Stage' })
})

test('the docs page reads the package README as its guide, and no two anchors on it are the same', async () => {
  const { guideSections } = await import('../src/blobscape/api/guide.ts')
  const { groupId, sectionId } = await import('../src/blobscape/api/types.ts')
  const guide = guideSections(readFileSync(new URL('../packages/engine/README.md', import.meta.url), 'utf8'))
  assert.deepEqual(guide.map((g) => g.id), ['install', 'a-creature-on-a-canvas', 'your-own-creature', 'a-scene-written-as-data-in-pixel-art', 'files'])
  assert.match(guide[0].html, /npm install @blobscape\/engine three/)
  assert.ok(guide.every((g) => !g.html.includes('href="https://blobscape.dev')), 'links to this site are paths')
  const api = JSON.parse(readFileSync(new URL('../src/blobscape/engineApi.json', import.meta.url), 'utf8'))
  const ids = ['getting-started', 'guides', ...guide.map((g) => g.id), ...api.groups.map((g) => groupId(g.id)), ...api.modules.map((m) => sectionId(m.id)), ...api.modules.flatMap((m) => m.entries.map((e) => e.name))]
  assert.equal(new Set(ids).size, ids.length, 'two anchors are the same')
})
