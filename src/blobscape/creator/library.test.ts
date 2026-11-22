import { withHeavens } from '../../splat-engine/heavens.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { checkScene, compileScene, type SceneDoc } from '../../splat-engine/sceneDoc.ts'
import { markedPicks, outsideProps, splitScene } from '../../splat-engine/project.ts'
import { DIORAMAS } from '../diorama/scenes.ts'
import { WINDMILL } from '../diorama/scenes/windmill.ts'
import { buildVoxels } from '../../splat-engine/voxel.ts'
import { loopSnaps } from '../../splat-engine/sceneChecks.ts'
import { LIBRARY, libraryCreature, libraryProp } from './library.ts'

const CHUNKY = 0.042

test('no two library entries share an id or a name, and every one has a sentence and a card picture', () => {
  assert.equal(new Set(LIBRARY.map((e) => e.id)).size, LIBRARY.length)
  assert.equal(new Set(LIBRARY.map((e) => e.name.toLowerCase())).size, LIBRARY.length)
  for (const e of LIBRARY) {
    assert.ok(e.about.length > 5, e.id)
    assert.ok(existsSync(new URL(`../../../public${e.picture}`, import.meta.url)), `${e.id}: no ${e.picture} (npm run props)`)
  }
})

test("every prop and land is a sound description that cuts to blobs and loops, and every prop's foot is where it stood", () => {
  for (const e of LIBRARY) {
    if (e.kind === 'creature') { assert.ok(libraryCreature(e.id), e.id); continue }
    const p = libraryProp(e.id)
    assert.ok(p, e.id)
    assert.deepEqual(checkScene(p.doc), [], e.id)
    const c = compileScene(p.doc, { puffs: false })
    const built = buildVoxels(c.spec(CHUNKY))
    assert.ok(built.blobs.count > 10, `${e.id}: ${built.blobs.count} blobs`)
    assert.deepEqual(loopSnaps(built.skeleton, c.pose, c.loop), [], `${e.id}: snaps`)
    if (e.kind === 'prop') {
      // its foot is where it met its scene's ground (placing puts that on the new land): its lowest blobs are at the
      // foot, or sunk a little below it, never floating over it
      let low = Infinity
      for (let i = 0; i < built.blobs.count; i++) low = Math.min(low, built.blobs.center[i * 3 + 1])
      assert.ok(low < p.foot[1] + 0.12 && low > p.foot[1] - 0.7, `${e.id}: lowest blob at ${low.toFixed(2)}, foot at ${p.foot[1].toFixed(2)}`)
    }
  }
})

/** The scenes written before a scene marked its own props (2026-11-19). Every scene after them marks at least one. */
const BEFORE_MARKS = ['lighthouse', 'campfire', 'dragon', 'bee', 'hand', 'reef', 'octopus', 'owl', 'isles', 'harvest', 'lab', 'croc', 'grove', 'hut', 'window', 'spider', 'snail', 'windmill', 'ruin', 'cave', 'canyon', 'cabin', 'koi', 'whales', 'turkey', 'henge', 'meadow', 'fishing']

test('every new scene marks its props, so Scene Creator splits it with nothing picked by hand', () => {
  for (const d of DIORAMAS) {
    // a scene made from props (docs/scenes-from-props.md) is held to more by the next test
    if (BEFORE_MARKS.includes(d.id) || d.project) continue
    assert.ok(d.doc, `${d.id}: a new scene is a description`)
    assert.ok(markedPicks(d.doc).length > 0, `${d.id}: mark each thing in it with a bone's \`prop\` (docs/scene-descriptions.md)`)
    // and its props are in the library, where the tests above cut each one and ask for its card
    assert.ok(LIBRARY.some((e) => e.from === d.id), `${d.id}: its props are not in the library`)
  }
})

/**
 * The scenes written before a scene had to be built from components (Matt, 2026-11-21). Every scene after them is
 * nothing but its land and its props: no part on a bone outside a prop, no light outside one, and every prop in the
 * library, so Scene Creator offers each thing in it and nothing exists only as part of a whole scene.
 */
const BEFORE_COMPONENTS = [...BEFORE_MARKS]

test('every new scene is built from components: its land and props that are each in the library, with nothing loose', () => {
  for (const d of DIORAMAS) {
    if (d.project) {
      // made from props: it names the library's own pieces, so it holds nothing of its own to be loose
      for (const ref of [d.project.land, ...d.project.props.map((p) => p.prop)]) assert.ok(typeof ref === 'string' && LIBRARY.some((e) => e.id === ref), `${d.id}: ${typeof ref === 'string' ? ref : ref.name} is not in the library`)
      continue
    }
    if (BEFORE_COMPONENTS.includes(d.id)) continue
    assert.ok(d.doc, `${d.id}: a new scene is a description`)
    assert.deepEqual(outsideProps(d.doc), [], `${d.id}: build it from props (docs/scene-descriptions.md, rule 13)`)
    for (const pick of markedPicks(d.doc)) assert.ok(LIBRARY.some((e) => e.id === `${d.id}-${pick.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`), `${d.id}: its prop ${pick.name} is not in the library`)
  }
})

test('what stands outside a scene\'s props is named: bones with parts that no prop holds, and lights', () => {
  const doc: SceneDoc = { ...WINDMILL, bones: (WINDMILL.bones ?? []).map((b) => (b.name === 'sails' ? { ...b, prop: 'Sails' } : b)), lights: [{ at: [9, 9, 9], color: '#ffffff', strength: 1, range: 1, lit: 'dark' }] }
  const out = outsideProps(doc)
  assert.ok(out.some((o) => o.includes("'duck'")), out.join('; '))
  assert.ok(!out.some((o) => o.includes("'sails'")))
  assert.ok(out.some((o) => o.startsWith('lights:')))
})

test('a scene that marks its props comes apart by them: each a sound prop that cuts and stands, the rest its land', () => {
  const doc: SceneDoc = {
    ...WINDMILL,
    bones: (WINDMILL.bones ?? []).map((b) => (b.name === 'sails' ? { ...b, prop: 'Sails' } : b.name === 'duck' ? { ...b, prop: 'Duck' } : b)),
  }
  assert.deepEqual(checkScene(doc), [])
  const picks = markedPicks(doc)
  assert.deepEqual(picks.map((p) => p.name), ['Sails', 'Duck'])
  const { land, props } = splitScene(doc, picks)
  assert.equal(props.length, 2)
  for (const p of props) {
    assert.deepEqual(checkScene(p.doc), [], p.name)
    const c = compileScene(p.doc, { puffs: false })
    const built = buildVoxels(c.spec(CHUNKY))
    assert.ok(built.blobs.count > 10, p.name)
    assert.deepEqual(loopSnaps(built.skeleton, c.pose, c.loop), [], `${p.name}: snaps`)
  }
  // the shared sun is written out as a part of the land
  assert.equal(land.doc.parts.length + props.reduce((n, p) => n + p.doc.parts.length, 0), withHeavens(doc).parts.length)
})

test('a prop mark must be a name, used once, and not on a bone riding on another prop', () => {
  const bones = (WINDMILL.bones ?? []).map((b) => ({ ...b }))
  const at = (name: string) => bones.findIndex((b) => b.name === name)
  const marked = (edit: (b: typeof bones) => void) => { const copy = bones.map((b) => ({ ...b })); edit(copy); return checkScene({ ...WINDMILL, bones: copy }) }
  assert.match(marked((b) => { b[at('duck')].prop = '' }).join(), /prop: must be a name/)
  assert.match(marked((b) => { b[at('duck')].prop = 'Duck'; b[at('sails')].prop = 'Duck' }).join(), /names two props/)
  const child = bones.findIndex((b) => b.parent)
  assert.ok(child > 0, 'the windmill has a bone that rides on another')
  assert.match(marked((b) => { b[at(b[child].parent!)].prop = 'Parent'; b[child].prop = 'Child' }).join(), /is a prop already/)
})
