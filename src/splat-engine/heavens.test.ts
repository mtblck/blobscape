import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MOST_STARS, heavenBones, ownClouds, showHeavens, starAt, withHeavens } from './heavens.ts'
import { checkScene, compileScene, litFor, type SceneDoc } from './sceneDoc.ts'

const SCENE: SceneDoc = {
  name: 'Night field', loop: 8, palette: ['#102030', '#305020', '#f0f0f0'],
  camera: { target: [0, 0.5, 0], distance: 4, azimuth: 20, elevation: 10 },
  bones: [{ name: 'tree', at: [0, 0, 0] }],
  parts: [
    { shape: { kind: 'box', at: [0, -0.05, 0], half: [1, 0.05, 1] }, paint: '#305020' },
    { shape: { kind: 'sphere', at: [0, 0.4, 0], r: 0.3 }, paint: '#305020', bone: 'tree' },
  ],
  heavens: { moon: { at: [-1.2, 2, -1.2], r: 0.18 }, stars: { count: 10 }, sun: { at: [1.4, 2.2, -1.4], r: 0.15 }, clouds: { cover: 'partly' } },
}

test('the moon, sun and stars are written out after every other part, each on a bone of its own', () => {
  const doc = withHeavens(SCENE)
  assert.equal(doc.heavens, undefined)
  assert.deepEqual(doc.parts.slice(0, 2), SCENE.parts)
  assert.equal(doc.parts.length, 2 + 1 + 1 + 10)
  const names = doc.bones!.map((b) => b.name)
  assert.deepEqual(names.slice(0, 3), ['tree', '~moon', '~sun'])
  assert.equal(names.filter((n) => n.startsWith('~star')).length, 10)
  assert.ok(doc.parts.slice(2).every((p) => p.glow && p.noShadow && p.bone?.startsWith('~')))
  // what they are painted in joins the palette, so pixel art has it
  assert.ok(doc.palette.includes('#f5f7ff'))
  assert.deepEqual(checkScene(doc), [])
  // a scene with none is left as it is
  const { heavens: _h, ...bare } = SCENE
  assert.equal(withHeavens(bare), bare)
})

test('stars keep off the moon and stand in the sky behind the view', () => {
  for (let i = 0; i < MOST_STARS; i++) {
    const p = starAt(SCENE, i), m = SCENE.heavens!.moon!
    assert.ok(Math.hypot(p[0] - m.at[0], p[1] - m.at[1], p[2] - m.at[2]) > m.r * 2, `star ${i} is on the moon`)
    assert.ok(p[1] > SCENE.camera.target[1], `star ${i} is below the view's middle`)
  }
  const boxed: SceneDoc = { ...SCENE, heavens: { stars: { count: 5, from: [-1, 2, -2], to: [1, 3, -1] } } }
  for (let i = 0; i < 5; i++) {
    const p = starAt(boxed, i)
    assert.ok(p[0] >= -1 && p[0] <= 1 && p[1] >= 2 && p[1] <= 3 && p[2] >= -2 && p[2] <= -1)
  }
})

test('the moon and stars wait for the night and the sun for the day', () => {
  const day = litFor(SCENE, false, undefined), night = litFor(SCENE, true, undefined)
  const bones = (d: SceneDoc) => new Set(d.parts.map((p) => p.bone))
  assert.ok(bones(day).has('~sun') && !bones(day).has('~moon') && !bones(day).has('~star0'))
  assert.ok(!bones(night).has('~sun') && bones(night).has('~moon') && bones(night).has('~star0'))
})

test('cloud cover puts the stars out first, then the moon and sun', () => {
  const c = compileScene(SCENE)
  const names = c.bones.map((b) => b.name), hb = heavenBones(names)
  assert.equal(hb.stars.length, 10)
  const shown = (cover: number) => {
    const size = new Float32Array(names.length).fill(1)
    showHeavens(size, hb, cover)
    return { stars: hb.stars.filter((b) => size[b] > 0).length, moon: size[hb.moon[0]], sun: size[hb.sun[0]] }
  }
  assert.deepEqual(shown(0), { stars: 10, moon: 1, sun: 1 })
  // the scene's own few clouds leave its sky as it is
  assert.equal(ownClouds(SCENE), 0.1875)
  const own = shown(ownClouds(SCENE))
  assert.ok(own.stars >= 7 && own.moon === 1 && own.sun === 1)
  const cloudy = shown(0.75)
  assert.ok(cloudy.stars <= 2 && cloudy.moon === 1)
  assert.deepEqual(shown(1), { stars: 0, moon: 0, sun: 0 })
  // as the sky clouds over, stars only go out
  let last = 10
  for (let k = 0; k <= 20; k++) { const n = shown(k / 20).stars; assert.ok(n <= last); last = n }
})

test('a sky of the wrong shape is caught', () => {
  const bad = (heavens: unknown) => checkScene({ ...SCENE, heavens } as SceneDoc)
  assert.match(bad({ stars: { count: 99 } }).join(), /heavens\.stars\.count/)
  assert.match(bad({ clouds: { cover: 'stormy' } }).join(), /heavens\.clouds\.cover/)
  assert.match(bad({ moon: { at: [0, 1], r: 0.1 } }).join(), /heavens\.moon\.at/)
  assert.match(bad({ stars: { count: 3, from: [0, 1, 0] } }).join(), /both from and to/)
})
