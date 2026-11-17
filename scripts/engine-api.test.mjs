// The API reference page shows src/blobscape/engineApi.json: it must say what the package's declarations say now.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { API_FILE, apiJson, buildApi } from './engine-api.mjs'

test('the API reference is up to date with the package (else: node scripts/engine-api.mjs)', () => {
  const api = buildApi()
  assert.equal(readFileSync(API_FILE, 'utf8'), apiJson(api), 'src/blobscape/engineApi.json is behind the code: run node scripts/engine-api.mjs')
  const all = api.modules.flatMap((m) => m.entries)
  const stage = all.find((e) => e.name === 'Stage')
  assert.ok(stage && stage.kind === 'class' && /setPixels\(/.test(stage.code) && !/private /.test(stage.code), 'Stage is listed without its private parts')
  assert.match(stage.doc, /front door/)
  for (const name of ['SplatWorld', 'Swing', 'compileScene', 'checkScene', 'buildVoxels', 'sculptToCount', 'writeRiggedGlb', 'makeFox', 'StageActor', 'Move']) assert.ok(all.some((e) => e.name === name), `${name} is missing`)
  assert.equal(new Set(all.map((e) => e.name)).size, all.length, 'a name is listed twice')
})
