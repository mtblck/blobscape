import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TAGS, checkTags, isTag, tagInfo, tagged } from './tags.ts'
import { checkScene, type SceneDoc } from './sceneDoc.ts'
import { leafy } from './project.ts'

const faults = (v: unknown) => {
  const out: string[] = []
  checkTags(v, 'tags', (at, what) => out.push(`${at}: ${what}`))
  return out
}

test('tags are one fixed list, each with a sort and a meaning, none twice', () => {
  assert.equal(new Set(TAGS.map((t) => t.id)).size, TAGS.length)
  for (const t of TAGS) assert.ok(t.means.length > 3 && ['kind', 'land', 'quality'].includes(t.sort), t.id)
  assert.ok(isTag('leafy') && !isTag('Leafy') && !isTag(3))
  assert.equal(tagInfo('floats')?.sort, 'quality')
  assert.equal(tagInfo('wet'), undefined)
})

test('a list of tags is checked: unknown words and doubles are named, and nothing is fine', () => {
  assert.deepEqual(faults(undefined), [])
  assert.deepEqual(faults(['tree', 'leafy']), [])
  assert.match(faults('tree')[0], /must be a list/)
  assert.match(faults(['tree', 'bushy'])[0], /^tags\[1\]: 'bushy' is not a tag \(they are: tree,/)
  assert.match(faults(['tree', 'tree'])[0], /^tags\[1\]: 'tree' is there twice/)
})

test('a description takes tags on its land and on bones marked as props only', () => {
  const doc = (over: Partial<SceneDoc>): SceneDoc => ({
    name: 'Tagged', loop: 8, palette: ['#101018', '#3f7a45'], camera: { target: [0, 0, 0], distance: 3, azimuth: 0, elevation: 10 },
    bones: [{ name: 'tree', at: [0, 0, 0], prop: 'Tree', tags: ['tree', 'leafy'] }, { name: 'post', at: [1, 0, 0] }],
    parts: [{ shape: { kind: 'sphere', at: [0, 0.5, 0], r: 0.3 }, paint: '#3f7a45', bone: 'tree' }],
    tags: ['grassy'],
    ...over,
  })
  assert.deepEqual(checkScene(doc({})), [])
  assert.ok(checkScene(doc({ tags: ['grassy', 'muddy' as never] })).some((f) => f.startsWith("tags[1]: 'muddy' is not a tag")))
  const loose = checkScene(doc({ bones: [{ name: 'tree', at: [0, 0, 0], tags: ['tree'] }] }))
  assert.ok(loose.some((f) => /bones\[0\]\.tags: only a bone marked as a prop takes tags/.test(f)), loose.join('\n'))
})

test('a tagged thing is found by its tags; leafy is leafy unless also evergreen', () => {
  assert.ok(tagged({ tags: ['tree'] }, 'tree') && !tagged({}, 'tree') && !tagged(undefined, 'tree'))
  assert.ok(leafy({ tags: ['tree', 'leafy'] } as never))
  assert.ok(!leafy({ tags: ['tree', 'leafy', 'evergreen'] } as never))
  assert.ok(!leafy({ name: 'Leafy tree' } as never), 'the name alone says nothing')
})
