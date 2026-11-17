import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LIT_MAX, box, buildVoxels, cone, cut, sphere, union, type VoxelSpec } from './voxel.ts'
import { posedPoint, axisAngle } from './rig.ts'

const ROOT = { name: 'root', parent: -1, head: [0, 0, 0] as [number, number, number] }

test('a ball becomes one layer of cells on its surface, about its area over a cell', () => {
  const s = 0.05, r = 1
  const { blobs } = buildVoxels({ bones: [ROOT], parts: [{ shape: sphere([0, 0, 0], r), color: [1, 1, 1], bone: 'root' }], spacing: s })
  for (let i = 0; i < blobs.count; i++) {
    const d = Math.hypot(blobs.center[i * 3], blobs.center[i * 3 + 1], blobs.center[i * 3 + 2])
    assert.ok(d <= r + 1e-6 && d > r - s - 1e-6, `cell at ${d}`)
    // on the shared grid
    assert.ok(Math.abs(blobs.center[i * 3] / s - Math.round(blobs.center[i * 3] / s)) < 1e-4)
  }
  const expected = (4 * Math.PI * r * r) / (s * s)
  assert.ok(blobs.count > expected * 0.7 && blobs.count < expected * 1.3, `${blobs.count} vs ${expected}`)
})

test('the same spec gives the same blobs', () => {
  const spec: VoxelSpec = { bones: [ROOT], parts: [{ shape: cut(box([0, 0, 0], [0.5, 0.3, 0.4], 0.05), sphere([0.3, 0.3, 0], 0.25)), color: (p) => [p[0] + 0.5, 0.5, 0.5], bone: 'root' }], spacing: 0.04 }
  const a = buildVoxels(spec), b = buildVoxels(spec)
  assert.ok(a.blobs.count > 500)
  assert.equal(a.blobs.count, b.blobs.count)
  assert.deepEqual(a.blobs.color.subarray(0, a.blobs.count * 3), b.blobs.color.subarray(0, b.blobs.count * 3))
})

test('a ball over a floor casts a shadow where the sun is blocked, and nowhere else', () => {
  const spec: VoxelSpec = {
    bones: [ROOT], spacing: 0.05,
    light: { dir: [0, 1, 0], ambient: 0.3, shadow: 1 },
    parts: [
      { shape: box([0, -0.1, 0], [2, 0.1, 2]), color: [1, 1, 1], bone: 'root' },
      { shape: sphere([0, 1, 0], 0.4), color: [1, 0, 0], bone: 'root' },
    ],
  }
  const { blobs, partOf } = buildVoxels(spec)
  let under = 0, open = 0, nu = 0, no = 0
  for (let i = 0; i < blobs.count; i++) {
    // the floor's top face only
    if (partOf[i] !== 0 || blobs.center[i * 3 + 1] < -0.01) continue
    const r = Math.hypot(blobs.center[i * 3], blobs.center[i * 3 + 2])
    if (r < 0.2) { under += blobs.color[i * 3]; nu++ } else if (r > 1 && r < 1.8) { open += blobs.color[i * 3]; no++ }
  }
  assert.ok(nu > 10 && no > 100)
  assert.ok(Math.abs(under / nu - 0.3 * LIT_MAX) < 0.02, `under the ball ${under / nu}`)
  assert.ok(Math.abs(open / no - LIT_MAX) < 0.02, `in the open ${open / no}`)
})

test('glow parts keep their color and cast no shadow', () => {
  const spec: VoxelSpec = {
    bones: [ROOT], spacing: 0.05, light: { dir: [0, 1, 0], ambient: 0.3, shadow: 1 },
    parts: [
      { shape: box([0, -0.1, 0], [1, 0.1, 1]), color: [1, 1, 1], bone: 'root' },
      { shape: sphere([0, 1, 0], 0.4), color: [0.9, 0.8, 0.2], bone: 'root', glow: true },
    ],
  }
  const { blobs, partOf } = buildVoxels(spec)
  for (let i = 0; i < blobs.count; i++) {
    if (partOf[i] === 1) assert.ok(Math.abs(blobs.color[i * 3] - 0.9) < 1e-6)
    else if (blobs.center[i * 3 + 1] > -0.01 && Math.max(Math.abs(blobs.center[i * 3]), Math.abs(blobs.center[i * 3 + 2])) < 0.9) assert.ok(blobs.color[i * 3] > LIT_MAX - 0.02, 'the floor under a lamp is lit')
  }
})

test('cells buried in a neighbor on the same bone are left out; on another bone they stay', () => {
  const a = sphere([0, 0, 0], 0.5), b = sphere([0.3, 0, 0], 0.5)
  const bones = [ROOT, { name: 'arm', parent: 0, head: [0.3, 0, 0] as [number, number, number] }]
  const count = (bone: string) => buildVoxels({ bones, spacing: 0.05, parts: [{ shape: a, color: [1, 1, 1], bone: 'root' }, { shape: b, color: [1, 1, 1], bone }] }).blobs.count
  const apart = count('arm'), merged = count('root')
  assert.ok(merged < apart * 0.85, `${merged} vs ${apart}`)
  // and a union is the same surface as the merged parts, give or take the seam
  const one = buildVoxels({ bones, spacing: 0.05, parts: [{ shape: union(a, b), color: [1, 1, 1], bone: 'root' }] }).blobs.count
  assert.ok(Math.abs(one - merged) < merged * 0.1, `${one} vs ${merged}`)
})

test('each part hangs wholly on its bone, and turns with it', () => {
  const bones = [ROOT, { name: 'lamp', parent: 0, head: [0, 1, 0] as [number, number, number] }]
  const { blobs, skin, skeleton, partOf } = buildVoxels({
    bones, spacing: 0.05,
    parts: [
      { shape: box([0, 0, 0], [0.3, 0.3, 0.3]), color: [1, 1, 1], bone: 'root' },
      { shape: cone([0, 1, 0], [1, 1, 0], 0.05, 0.2), color: [1, 1, 0], bone: 'lamp', glow: true },
    ],
  })
  const lamp = skeleton.index('lamp')
  let tip = -1
  for (let i = 0; i < blobs.count; i++) {
    assert.equal(skin.joints[i * 4], partOf[i] === 1 ? lamp : 0)
    assert.equal(skin.weights[i * 4], 1)
    if (partOf[i] === 1 && (tip < 0 || blobs.center[i * 3] > blobs.center[tip * 3])) tip = i
  }
  // a quarter turn about y swings the beam from +x to -z
  skeleton.setRotation(lamp, axisAngle([0, 1, 0], Math.PI / 2))
  skeleton.update()
  const p = posedPoint(skeleton, lamp, blobs.center.subarray(tip * 3, tip * 3 + 3))
  assert.ok(p[2] < -0.9 && Math.abs(p[0]) < 0.3, `${p}`)
})

test('painted light: shade turns cool and never passes the glow line, and the touches are off by default', async () => {
  const { bakedColor } = await import('./voxel.ts')
  const gray: [number, number, number] = [0.6, 0.6, 0.6]
  const plain = bakedColor(gray, 0.3, 0, 0)
  assert.ok(plain.every((v) => Math.abs(v - 0.18) < 1e-9))
  const cool = bakedColor(gray, 0.3, 0, 0.7)
  // a gray in shadow takes a blue-violet cast instead of staying gray
  assert.ok(cool[2] > cool[1] && cool[2] > plain[2] - 0.01, `${cool}`)
  for (const c of [[1, 1, 1], [1, 0.2, 0.1], [0.2, 1, 0.3]] as [number, number, number][]) {
    for (const lit of [0, 0.5, 1]) assert.ok(Math.max(...bakedColor(c, LIT_MAX, lit, 1, 1)) <= LIT_MAX + 1e-9)
  }
})

test('crevice darkens a corner and leaves an open face alone; a beam lights the floor it lands on', () => {
  const spec = (light: VoxelSpec['light'], beams?: VoxelSpec['beams']): VoxelSpec => ({
    bones: [ROOT], spacing: 0.04, light: { ambient: 1, shadow: 0, ...light }, beams,
    parts: [{ shape: box([0, -0.1, 0], [1, 0.1, 1]), color: [0.5, 0.5, 0.5], bone: 'root' }, { shape: box([0, 0.5, -0.6], [1, 0.5, 0.1]), color: [0.5, 0.5, 0.5], bone: 'root' }],
  })
  const at = (b: ReturnType<typeof buildVoxels>, x: number, y: number, z: number) => {
    let best = -1, d = Infinity
    for (let i = 0; i < b.blobs.count; i++) {
      const e = Math.hypot(b.blobs.center[i * 3] - x, b.blobs.center[i * 3 + 1] - y, b.blobs.center[i * 3 + 2] - z)
      if (e < d) { d = e; best = i }
    }
    return b.blobs.color[best * 3]
  }
  const off = buildVoxels(spec({})), on = buildVoxels(spec({ crevice: 1 }))
  // the floor at the foot of the wall, and out in the open
  assert.ok(at(on, 0, 0, -0.48) < at(off, 0, 0, -0.48) - 0.02)
  assert.ok(Math.abs(at(on, 0, 0, 0.6) - at(off, 0, 0, 0.6)) < 1e-6)
  const lit = buildVoxels(spec({}, [{ from: [0, 1.5, 0.4], to: [0, 0, 0.4], r: 0.2, color: [1, 0.9, 0.5], strength: 1 }]))
  assert.ok(at(lit, 0, 0, 0.4) > at(off, 0, 0, 0.4) + 0.05)
  assert.ok(Math.abs(at(lit, 0, 0, -0.2) - at(off, 0, 0, -0.2)) < 1e-6)
})
