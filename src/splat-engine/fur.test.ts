import assert from 'node:assert/strict'
import { test } from 'node:test'
import { quatToMat } from '../splat-core/blobs.ts'
import { growFur, quatFromAxes, type FurryPart } from './fur.ts'
import { buildSculpt, scales } from './sculpt.ts'
import { buildVoxels, cone, displace, sphere } from './voxel.ts'

const bones = [{ name: 'root', parent: -1, head: [0, 0, 0] as [number, number, number], tail: [0, 1, 0] as [number, number, number] }, { name: 'tip', parent: 0, head: [0, 1, 0] as [number, number, number], tail: [0, 2, 0] as [number, number, number] }]
const parts: FurryPart[] = [
  { shape: cone([0, 0, 0], [0, 2, 0], 0.3, 0.2), color: [0.8, 0.4, 0.1], bones: ['root', 'tip'], fur: { length: 0.1, flow: [0, 1, 0] } },
  { shape: sphere([0, 2.3, 0], 0.15), color: [0.1, 0.1, 0.1], bones: ['tip'], group: 'nose' },
]

test('quatFromAxes turns x, y and z onto the axes given', () => {
  const x: [number, number, number] = [0, 0, 1], y: [number, number, number] = [1, 0, 0], z: [number, number, number] = [0, 1, 0]
  const m = quatToMat(quatFromAxes(x, y, z))
  // the columns of the rotation are the axes
  for (let r = 0; r < 3; r++) for (const [c, v] of [x, y, z].entries()) assert.ok(Math.abs(m[r * 3 + c] - v[r]) < 1e-6)
})

test('fur makes exactly the count asked for, on furred parts only, hung on their root cells’ bones, the same every time', () => {
  const shell = buildSculpt({ bones, parts, blend: 0.3 }, 0.05)
  const a = growFur(shell, parts, shell.blobs.count * 3)
  assert.equal(a.blobs.count, shell.blobs.count * 3)
  assert.equal(a.skin.weights.length, a.blobs.count * 4)
  let along = 0
  for (let i = shell.blobs.count; i < a.blobs.count; i++) {
    assert.equal(a.partOf[i], 0, 'no strand on the bare nose')
    const w = a.skin.weights.subarray(i * 4, i * 4 + 4)
    assert.ok(Math.abs(w[0] + w[1] + w[2] + w[3] - 1) < 1e-5)
    // a strand is long along its own z, and that runs up the body, the way the fur lies
    const s = a.blobs.scale.subarray(i * 3, i * 3 + 3)
    assert.ok(s[2] > s[0] && s[0] > s[1])
    const m = quatToMat(a.blobs.quat.subarray(i * 4, i * 4 + 4))
    if (m[5] > 0.5) along++
  }
  assert.ok(along > (a.blobs.count - shell.blobs.count) * 0.8, `${along} strands point up the body`)
  const b = growFur(buildSculpt({ bones, parts, blend: 0.3 }, 0.05), parts, shell.blobs.count * 3)
  assert.deepEqual([...b.blobs.center], [...a.blobs.center])
})

test('a skin pushed in and out keeps its holes to the sharpest creases when its layer is measured in true distance', () => {
  const s = 0.02
  const bumpy = displace(cone([0, 0, 0], [0, 1, 0], 0.2, 0.2), (x, y, z) => 0.03 * (1 - scales([x, y, z * 0.36], 0.08).out), 0.03)
  const holes = (trueShell: boolean) => {
    const b = buildVoxels({ bones: [bones[0]], parts: [{ shape: bumpy, color: [1, 1, 1], bone: 'root' }], spacing: s, trueShell }).blobs
    let miss = 0
    for (let k = 0; k < 400; k++) {
      // walk in from outside to the surface along a level ray
      const a = k * 2.399, y = 0.2 + (k % 20) * 0.03
      let r = 0.4
      while (r > 0 && bumpy.sdf(Math.cos(a) * r, y, Math.sin(a) * r) > 0) r -= s * 0.05
      const p = [Math.cos(a) * r, y, Math.sin(a) * r]
      let best = Infinity
      for (let i = 0; i < b.count; i++) best = Math.min(best, Math.hypot(b.center[i * 3] - p[0], b.center[i * 3 + 1] - p[1], b.center[i * 3 + 2] - p[2]))
      if (best > s * 1.1) miss++
    }
    return miss
  }
  // read raw, the bumps' steep sides leave holes (22 of 400 here); in true distance, a few at the sharpest creases
  const raw = holes(false), fixed = holes(true)
  assert.ok(fixed * 3 < raw && fixed < 10, `${fixed} holes, ${raw} read raw`)
})
