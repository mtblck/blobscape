import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AURORA_CURTAINS, METEORS, METEOR_SECONDS, SKY_EFFECTS, auroraLight, effectOut, skyEffectAsked, skyEffectDoc } from './skyEffects.ts'
import { checkScene, compileScene } from './sceneDoc.ts'
import { Skeleton } from './rig.ts'

const VIEW = { target: [0, 1.4, 0] as [number, number, number], distance: 6.4, azimuth: 14, elevation: 7 }

test('every sky effect is a sound description, behind and above the view it is made for', () => {
  for (const e of SKY_EFFECTS) {
    const doc = skyEffectDoc(e.id, VIEW, 12)
    assert.deepEqual(checkScene(doc), [], e.id)
    assert.ok(doc.parts.every((p) => p.glow && p.noShadow), e.id)
    // behind the target from the eye (the eye is toward +z turned by the azimuth) and above it
    const a = (VIEW.azimuth * Math.PI) / 180, back = [-Math.sin(a), -Math.cos(a)]
    for (const b of doc.bones!) {
      assert.ok(b.at[1] > VIEW.target[1] + 0.15 * VIEW.distance, `${e.id} ${b.name} high`)
      assert.ok(b.at[0] * back[0] + b.at[2] * back[1] > 0, `${e.id} ${b.name} behind`)
    }
  }
  assert.equal(skyEffectAsked('meteors'), 'meteors')
  assert.equal(skyEffectAsked('rainbow'), undefined)
})

test('the aurora is its curtains, always there; each meteor is out only for its own moment, seldom two at once', () => {
  const aurora = compileScene(skyEffectDoc('aurora', VIEW, 12), { puffs: false })
  const curtains = aurora.bones.map((b, i) => (b.name.startsWith('aurora') ? i : -1)).filter((i) => i >= 0)
  assert.equal(curtains.length, AURORA_CURTAINS)
  const sk = new Skeleton(aurora.bones)
  for (let t = 0; t < 12; t += 0.5) {
    aurora.pose(sk, t)
    assert.ok(curtains.every((b) => sk.size[b] > 0.8), `aurora at ${t}`)
  }
  const loop = 12, shower = compileScene(skyEffectDoc('meteors', VIEW, loop), { puffs: false })
  const meteors = shower.bones.map((b, i) => (b.name.startsWith('meteor') ? i : -1)).filter((i) => i >= 0)
  assert.equal(meteors.length, METEORS)
  const mk = new Skeleton(shower.bones), seen = new Set<number>()
  for (let t = 0; t < loop; t += 0.05) {
    shower.pose(mk, t)
    const out = meteors.filter((b) => mk.size[b] > 0.05)
    assert.ok(out.length <= 2, `at ${t.toFixed(2)} ${out.length} meteors are out`)
    out.forEach((i) => seen.add(i))
  }
  // every one of them crosses once a loop
  assert.equal(seen.size, METEORS)
  // and each is out about as long as it should be, whatever the loop
  shower.pose(mk, 0)
  let longest = 0, run = 0
  for (let t = 0; t < loop; t += 0.02) { shower.pose(mk, t); run = mk.size[meteors[0]] > 0.05 ? run + 0.02 : 0; longest = Math.max(longest, run) }
  assert.ok(longest > METEOR_SECONDS * 0.6 && longest <= METEOR_SECONDS + 0.05, `${longest}`)
})

test('a sky effect is out only at night, and goes as clouds come over', () => {
  assert.equal(effectOut(0, 0), 0)
  assert.equal(effectOut(1, 0), 1)
  assert.equal(effectOut(1, 1), 0)
  assert.ok(effectOut(1, 0.5) > 0 && effectOut(1, 0.5) < 1)
  assert.equal(auroraLight(VIEW, 0), undefined)
  assert.ok(auroraLight(VIEW, 1)!.color[1] > auroraLight(VIEW, 0.5)!.color[1])
})
