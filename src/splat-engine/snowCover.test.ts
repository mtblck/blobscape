import assert from 'node:assert/strict'
import { test } from 'node:test'
import { axisAngle } from './rig.ts'
import { Skeleton } from './rig.ts'
import { followSnow, makeSnowCover, pileSnow } from './snowCover.ts'

/** Where blob `k` of a layer is drawn: its center through its bone's skin matrix. */
function drawnAt(m: Float32Array, c: Float32Array, k: number, b: number) {
  const x = c[k * 3], y = c[k * 3 + 1], z = c[k * 3 + 2], o = b * 16
  return [0, 1, 2].map((r) => m[o + r] * x + m[o + 4 + r] * y + m[o + 8 + r] * z + m[o + 12 + r])
}

// a floor (bone 0) and a raised slab on bone 1 over x > 0, like a boat or a crown that moves
const bones = [{ name: 'land', parent: -1, head: [0, 0, 0] as [number, number, number] }, { name: 'slab', parent: 0, head: [0.5, 0.2, 0] as [number, number, number] }]
const lying = (x: number) => (x > 0.1 ? { y: 0.2, bone: 1 } : { y: 0, bone: 0 })
const cover = () => makeSnowCover((x) => lying(x), { x: 0, z: 0, radius: 1, top: 2, bottom: -1, spacing: 0.05, bones })

test('snow lying is carried by the bone of what it lies on, and follows it as it moves', () => {
  const c = cover()
  pileSnow(c, 1)
  const on = (b: number) => { let n = 0; for (let k = 0; k < c.blobs.count; k++) if (c.skin.joints[k * 4] === b) n++; return n }
  assert.ok(on(1) > 100 && on(0) > 100, `${on(0)} on the floor, ${on(1)} on the slab`)
  const sk = new Skeleton(bones)
  sk.offset.set([0.3, 0.1, -0.2], 3)
  sk.setRotation(1, axisAngle([0, 0, 1], 0.2))
  sk.update()
  followSnow(c, sk)
  for (let k = 0; k < c.blobs.count; k++) {
    const b = c.skin.joints[k * 4]
    const want = drawnAt(sk.matrix, c.blobs.center, k, b), got = drawnAt(c.skeleton.matrix, c.blobs.center, k, b)
    if (got.some((v, i) => Math.abs(v - want[i]) > 1e-5)) assert.fail(`blob ${k} on bone ${b} is at ${got}, its bone puts it at ${want}`)
  }
})

test('snow slides off a thing turned over, and lies again as it comes back up', () => {
  const c = cover(), sk = new Skeleton(bones)
  const scaleOf = (b: number) => c.skeleton.scale[b]
  for (const [angle, kept] of [[0, 1], [Math.PI * 0.3, 1], [Math.PI / 2, 0], [Math.PI, 0], [0, 1]] as const) {
    sk.reset()
    sk.setRotation(1, axisAngle([1, 0, 0], angle))
    sk.update()
    followSnow(c, sk)
    assert.ok(Math.abs(scaleOf(1) - kept) < 1e-6, `at ${angle} the slab's snow is ${scaleOf(1)} of its size`)
    assert.equal(scaleOf(0), 1)
  }
})

test('given no bones, snow lies on one still bone as before', () => {
  const c = makeSnowCover((x) => lying(x).y, { x: 0, z: 0, radius: 1, top: 2, bottom: -1, spacing: 0.05 })
  assert.equal(c.skeleton.count, 1)
  for (let k = 0; k < c.blobs.count; k++) if (c.skin.joints[k * 4] !== 0) assert.fail(`blob ${k}`)
})
