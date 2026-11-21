import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DIORAMAS } from './scenes.ts'
import { DETAIL } from './scene.ts'
import { LIGHTHOUSE } from './scenes/lighthouse.ts'
import { CAMPFIRE } from './scenes/campfire.ts'
import { BEE } from './scenes/bee.ts'
import { DRAGON } from './scenes/dragon.ts'
import { HAND } from './scenes/hand.ts'
import { REEF } from './scenes/reef.ts'
import { WINDMILL } from './scenes/windmill.ts'
import { checkScene, isLit, litFor } from '../../splat-engine/sceneDoc.ts'
import { MAX_PALETTE_SIZE } from '../../splat-core/pixel.ts'
import { MAX_MUD, MIN_VALUE_RANGE, loopSnaps, partClashes, valuesOf } from '../../splat-engine/sceneChecks.ts'

test('the described scenes are sound, and are data alone', () => {
  for (const doc of [BEE, CAMPFIRE, DRAGON, HAND, REEF, WINDMILL, LIGHTHOUSE]) {
    assert.deepEqual(checkScene(doc), [], doc.name)
    // nothing but what a .json file could hold
    assert.deepEqual(JSON.parse(JSON.stringify(doc)), doc, doc.name)
  }
})

test('every scene builds at every detail with all of its parts, reads in grayscale, and loops without a snap', () => {
  for (const d of DIORAMAS) {
    let last = 0
    for (const level of DETAIL) {
      const b = d.make(level.spacing)
      assert.ok(b.blobs.count > last && b.blobs.count < 240000, `${d.id} ${level.id}: ${b.blobs.count}`)
      assert.equal(new Set(b.partOf).size, b.partOf.reduce((m, p) => Math.max(m, p), 0) + 1, `${d.id} ${level.id}: a part caught no grid cell`)
      last = b.blobs.count
    }
    const built = d.make(DETAIL[0].spacing)
    const { skeleton: sk, blobs } = built
    // it still reads in grayscale, and nothing seen snaps from place to place
    const v = valuesOf(blobs)
    assert.ok(v.light - v.dark >= MIN_VALUE_RANGE, `${d.id}: values ${v.dark.toFixed(2)} to ${v.light.toFixed(2)} read as one tone`)
    assert.ok(v.mud <= MAX_MUD, `${d.id}: ${Math.round(v.mud * 100)}% gray mud`)
    assert.deepEqual(loopSnaps(sk, d.pose, d.loop), [], `${d.id}: snaps`)
    // and no part turns or swings through another (the lighthouse is cut on a finer grid)
    const clashes = partClashes(built, d.pose, d.loop, DETAIL[0].spacing * (d.id === 'lighthouse' ? LIGHTHOUSE.grid! : 1))
      .filter((c) => !d.touching?.includes(c.part) && !d.touching?.includes(c.into))
    assert.deepEqual(clashes, [], `${d.id}: parts pass through each other`)
    const [l0, l1] = [d.lights(0.9), d.lights(0.9 + d.loop)]
    assert.ok(l0.every((l, i) => [...l.position, ...l.color].every((x, j) => Math.abs(x - [...l1[i].position, ...l1[i].color][j]) < 1e-6)), `${d.id}: lights loop`)
    d.pose(sk, 0.9)
    const a = Float32Array.from(sk.matrix)
    d.pose(sk, 0.9 + d.loop)
    for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - sk.matrix[i]) < 1e-4, `${d.id}: matrix ${i}`)
    assert.ok(d.palette.colors.length <= MAX_PALETTE_SIZE && d.views.length > 0, d.id)
    assert.equal(d.lights(0).length, d.lights(3).length)
  }
})

test('every light in every scene says when it shines, and a scene is sound by day and in the dark', () => {
  for (const d of DIORAMAS) {
    if (!d.doc) continue
    const doc = d.doc
    ;(doc.lights ?? []).forEach((l, i) => assert.ok(l.lit, `${d.id}: lights[${i}] must say when it shines: lit 'dark' (a lamp, a candle, a window, a fire), 'day' or 'always' (docs/scene-descriptions.md, rule 14)`))
    // a lamp that goes out by day has something that stops glowing with it: its glass, its flame, its pane
    if ((doc.lights ?? []).some((l) => l.lit === 'dark')) assert.ok(doc.parts.some((p) => p.lit === 'dark'), `${d.id}: a light waits for the dark but no glowing part does: give the lamp's glowing parts lit 'dark' too`)
    for (const dark of [false, true]) {
      const at = litFor(doc, dark)
      assert.deepEqual(checkScene(at), [], `${d.id} ${dark ? 'in the dark' : 'by day'}`)
      // nothing that should be out still glows or shines
      for (const p of at.parts) assert.ok(!p.lit || isLit(p.lit, dark, doc.lamps), `${d.id}: a part is lit out of its time`)
      at.lights?.forEach((l) => assert.ok(isLit(l.lit, dark, doc.lamps) || l.strength === 0))
      assert.equal(at.lights?.length, doc.lights?.length, `${d.id}: lights keep their places`)
    }
    const timed = d.timed?.('night')
    if (timed) {
      assert.equal(timed.id, d.id); assert.equal(timed.timed?.('night'), timed, `${d.id}: a time of day is made once`)
      assert.equal(timed.at, 'night'); assert.equal(timed.of?.id, d.id)
      assert.ok(timed.finish.sky && timed.palette.colors.length <= 32 && Array.isArray(timed.ambient), `${d.id}: a time brings its sky, palette and light`)
    }
  }
})
