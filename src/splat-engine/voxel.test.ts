import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LIT_MAX, PAINTED, bakedColor, bandOf, banded, hugged, stepper, blend, box, buildVoxels, inkedAt, cylinder, cone, cut, lathe, letterGrid, pixelText, sphere, sweep, union, type VoxelSpec } from './voxel.ts'
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

test('a lamp\'s shadow is baked per blob: the floor behind a wall can\'t see it, the open floor can', () => {
  const b = buildVoxels({
    bones: [ROOT], spacing: 0.04,
    parts: [{ shape: box([0, -0.1, 0], [1, 0.1, 1]), color: [0.5, 0.5, 0.5], bone: 'root' }, { shape: box([0, 0.3, 0], [0.6, 0.3, 0.05]), color: [0.5, 0.5, 0.5], bone: 'root' }],
    lamps: [null, { at: [0, 0.5, 0.6], reach: 1.5 }],
  })
  assert.ok(b.seen && b.seen.length === b.blobs.count * 4)
  const near = (x: number, z: number) => {
    let best = -1, d = Infinity
    for (let i = 0; i < b.blobs.count; i++) {
      const e = Math.hypot(b.blobs.center[i * 3] - x, b.blobs.center[i * 3 + 1], b.blobs.center[i * 3 + 2] - z)
      if (e < d) { d = e; best = i }
    }
    return best
  }
  const behind = near(0, -0.3), open = near(0, 0.6)
  assert.ok(b.seen[behind * 4 + 1] < 40, `behind ${b.seen[behind * 4 + 1]}`)
  assert.ok(b.seen[open * 4 + 1] > 200, `open ${b.seen[open * 4 + 1]}`)
  // a gap in the list casts nothing, and the bytes past the lamps stay full
  assert.equal(b.seen[behind * 4], 255)
  assert.equal(b.seen[behind * 4 + 3], 255)
  // without lamps nothing is baked
  assert.equal(buildVoxels({ bones: [ROOT], spacing: 0.05, parts: [{ shape: sphere([0, 0, 0], 0.3), color: [1, 1, 1], bone: 'root' }] }).seen, undefined)
})

test('a lamp in a small hollow: with its own clear distance the roof right over it hides it, with the usual one the roof is taken for its housing', () => {
  const made = (clear?: number) => buildVoxels({
    bones: [ROOT], spacing: 0.02,
    // a slab 0.06 over the lamp, 0.06 thick
    parts: [{ shape: box([0, 0.39, 0], [0.2, 0.03, 0.2]), color: [0.5, 0.5, 0.5], bone: 'root' }],
    lamps: [{ at: [0, 0.3, 0], reach: 0.8, clear }],
  })
  const top = (b: ReturnType<typeof buildVoxels>) => {
    let best = -1, d = Infinity
    for (let i = 0; i < b.blobs.count; i++) {
      const e = Math.hypot(b.blobs.center[i * 3], b.blobs.center[i * 3 + 1] - 0.42, b.blobs.center[i * 3 + 2])
      if (e < d) { d = e; best = i }
    }
    return b.seen![best * 4]
  }
  assert.equal(top(made()), 255)
  assert.ok(top(made(0.04)) < 40, `top ${top(made(0.04))}`)
})

test('cover: snow on open tops only, moss in the corners first, dust under cover too, and bare parts keep their paint', () => {
  const spec = (cover?: VoxelSpec['cover'], bare = false): VoxelSpec => ({
    bones: [ROOT], spacing: 0.04, light: { ambient: 1, shadow: 0 }, cover,
    parts: [
      { shape: box([0, -0.1, 0], [1, 0.1, 1]), color: [0.2, 0.2, 0.2], bone: 'root', bare },
      // a slab held over one end of the floor, and a wall at the back
      { shape: box([0.6, 0.5, 0.3], [0.3, 0.04, 0.3]), color: [0.2, 0.2, 0.2], bone: 'root' },
      { shape: box([0, 0.4, -0.75], [1, 0.4, 0.1]), color: [0.2, 0.2, 0.2], bone: 'root' },
    ],
  })
  const red = (b: ReturnType<typeof buildVoxels>, x: number, y: number, z: number) => {
    let best = -1, d = Infinity
    for (let i = 0; i < b.blobs.count; i++) {
      const e = Math.hypot(b.blobs.center[i * 3] - x, b.blobs.center[i * 3 + 1] - y, b.blobs.center[i * 3 + 2] - z)
      if (e < d) { d = e; best = i }
    }
    return b.blobs.color[best * 3] - b.blobs.color[best * 3 + 1]
  }
  const C: [number, number, number] = [1, 0, 0]
  const plain = buildVoxels(spec())
  assert.ok(Math.abs(red(plain, -0.3, 0, 0.3)) < 1e-6)
  const snow = buildVoxels(spec({ kind: 'snow', color: C, amount: 0.5 }))
  assert.ok(red(snow, -0.3, 0, 0.3) > 0.5, 'open floor')
  assert.ok(red(snow, 0.6, 0.54, 0.3) > 0.5, 'top of the slab')
  assert.ok(red(snow, 0.6, 0, 0.3) < 0.05, 'floor under the slab')
  assert.ok(red(snow, 0, 0.4, -0.65) < 0.05, 'face of the wall')
  const dust = buildVoxels(spec({ kind: 'dust', color: C, amount: 0.6 }))
  assert.ok(red(dust, 0.6, 0, 0.3) > 0.3, 'dust under the slab')
  const moss = buildVoxels(spec({ kind: 'moss', color: C, amount: 0.35 }))
  let corner = 0, open = 0
  for (let x = -0.9; x < 0.2; x += 0.04) { corner += red(moss, x, 0, -0.63); open += red(moss, x, 0, 0.5) }
  assert.ok(corner > open + 2, `corner ${corner} open ${open}`)
  const bare = buildVoxels(spec({ kind: 'snow', color: C, amount: 1 }, true))
  assert.ok(Math.abs(red(bare, -0.3, 0, 0.3)) < 1e-6)
})

test('more shapes: a turned vase, a swept tube, blended seams, pixel letters and a letter-grid model', () => {
  // a vase: wide belly, narrow neck
  const vase = lathe([0, 0, 0], [[0.2, 0], [0.4, 0.3], [0.15, 0.7], [0.2, 0.8]])
  assert.ok(vase.sdf(0.3, 0.3, 0) < 0 && vase.sdf(0, 0.3, 0.3) < 0, 'inside the belly, all the way round')
  assert.ok(vase.sdf(0.3, 0.7, 0) > 0, 'outside the neck')
  assert.ok(Math.abs(vase.sdf(0.4, 0.3, 0)) < 1e-9, 'on the widest point')
  assert.ok(vase.sdf(0, 0.9, 0) > 0 && vase.sdf(0, -0.1, 0) > 0)
  // a tube that bends round a corner and thins
  const tube = sweep([[0, 0, 0], [1, 0, 0], [1, 1, 0]], 0.2, 0.05)
  assert.ok(tube.sdf(0.5, 0, 0) < 0 && tube.sdf(1, 0.9, 0) < 0 && tube.sdf(0.5, 0.5, 0) > 0)
  assert.ok(tube.sdf(1, 0.98, 0.1) > 0, 'thin at the end')
  // two boxes meeting at a right angle: every blend fills the inside corner, a plain join doesn't
  const a = box([0, 0.5, 0], [0.1, 0.5, 0.5]), b = box([0.5, 0, 0], [0.5, 0.1, 0.5])
  const corner: [number, number, number] = [0.13, 0.13, 0]
  assert.ok(union(a, b).sdf(...corner) > 0)
  for (const k of ['smooth', 'chamfer', 'stairs'] as const) assert.ok(blend(k, 0.15, [a, b]).sdf(...corner) < 0, k)
  assert.ok(blend('chamfer', 0.15, [a, b]).sdf(0.6, 0.6, 0) > 0, 'nothing far from the seam')
  // "HI" 0.5 tall: the H's crossbar is filled, the gap between the letters is not
  const hi = pixelText([0, 0, 0], 'HI', 0.5, 0.1)
  const px = 0.1, left = -(7 * px) / 2
  assert.ok(hi.sdf(left + 1.5 * px, 0, 0) < 0, 'H crossbar')
  assert.ok(hi.sdf(left + 1.5 * px, 0.2, 0) > 0, 'above the crossbar, between the uprights')
  assert.ok(hi.sdf(left + 3.5 * px, 0, 0) > 0, 'the gap between letters')
  assert.ok(hi.sdf(left + 1.5 * px, 0, 0.2) > 0, 'in front of it')
  const built = buildVoxels({ bones: [ROOT], spacing: 0.02, parts: [{ shape: hi, color: [1, 1, 1], bone: 'root' }] })
  assert.ok(built.blobs.count > 100)
  // a little tree: trunk t, leaves l
  const tree = letterGrid([0, 0, 0], 0.1, [['...', '.t.', '...'], ['...', '.t.', '...'], ['lll', 'lll', 'lll'], ['...', '.l.', '...']])
  assert.ok(tree.sdf(0, 0.05, 0) < 0 && tree.sdf(0.1, 0.05, 0) > 0 && tree.sdf(0.1, 0.25, 0.1) < 0)
  assert.equal(tree.letterAt([0, 0.1, 0.05], [0, 0, 1]), 't')
  assert.equal(tree.letterAt([0.1, 0.3, 0], [0, 1, 0]), 'l')
  assert.ok(Math.abs(tree.max[1] - 0.4) < 1e-9 && Math.abs(tree.min[0] + 0.15) < 1e-9)
})

test('ink: a share of 4x4 blocks carry a mark, a big face never repeats, and a part without ink is untouched', () => {
  const N = 96
  for (const kind of ['hatch', 'stipple', 'cracks', 'grain', 'tufts', 'scales'] as const) {
    const mask = (x: number, z: number) => inkedAt({ kind, amount: 0.5 }, x, 0, z, [0, 1, 0], 3)
    let on = 0, blocks = 0
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (mask(x, z)) on++
    for (let bz = 0; bz < N; bz += 4) for (let bx = 0; bx < N; bx += 4) { let any = false; for (let k = 0; k < 16; k++) any ||= mask(bx + (k & 3), bz + (k >> 2)); if (any) blocks++ }
    assert.ok(on > 0 && on < N * N * 0.3, `${kind}: ${on} inked`)
    // about half the blocks; a shifted row can split a mark over two blocks, so allow some slack
    assert.ok(blocks > N * N / 16 * 0.3 && blocks < N * N / 16 * 0.9, `${kind}: ${blocks} blocks`)
    // no shift of a block or more (up to 24 cells) either way lines the face up with itself; a mark's own strokes touch, so shorter shifts are left out
    for (let d = 4; d <= 24; d++) {
      let sameX = 0, sameZ = 0, total = 0
      for (let z = 0; z < N - 24; z++) for (let x = 0; x < N - 24; x++) {
        const m = mask(x, z)
        if (!m) continue
        total++
        if (mask(x + d, z)) sameX++
        if (mask(x, z + d)) sameZ++
      }
      assert.ok(sameX < total * 0.5 && sameZ < total * 0.5, `${kind} repeats every ${d}`)
    }
  }
  const spec = (ink?: { kind: 'cracks'; amount: number }): VoxelSpec => ({ bones: [ROOT], spacing: 0.04, light: { ambient: 1, shadow: 0 }, parts: [{ shape: box([0, 0, 0], [1, 0.1, 1]), color: [0.6, 0.5, 0.4], bone: 'root', ink }] })
  const plain = buildVoxels(spec()), inked = buildVoxels(spec({ kind: 'cracks', amount: 0.6 }))
  assert.equal(plain.blobs.count, inked.blobs.count)
  let darker = 0
  for (let i = 0; i < plain.blobs.count; i++) if (inked.blobs.color[i * 3] < plain.blobs.color[i * 3] - 0.1) darker++
  assert.ok(darker > 50 && darker < plain.blobs.count * 0.3, `${darker} of ${plain.blobs.count}`)
})

test('glass: water mirrors a red post standing in it, shows its depth, and keeps its earth sides when `top`', () => {
  const spec = (glass?: { see?: number; mirror?: number; top?: boolean }): VoxelSpec => ({
    bones: [ROOT], spacing: 0.04, light: { ambient: 0.6, shadow: 0 }, eye: [0, 1.2, 3], sky: [[0, 0, 1], [0, 0, 1]],
    parts: [
      { shape: box([0, -0.2, 0], [1, 0.2, 1]), color: [0.2, 0.5, 0.6], bone: 'root', glass },
      { shape: box([0, 0.5, -0.3], [0.15, 0.5, 0.15]), color: [1, 0, 0], bone: 'root' },
    ],
  })
  const near = (b: ReturnType<typeof buildVoxels>, x: number, y: number, z: number) => {
    let best = -1, d = Infinity
    for (let i = 0; i < b.blobs.count; i++) {
      const e = Math.hypot(b.blobs.center[i * 3] - x, b.blobs.center[i * 3 + 1] - y, b.blobs.center[i * 3 + 2] - z)
      if (e < d) { d = e; best = i }
    }
    return [b.blobs.color[best * 3], b.blobs.color[best * 3 + 1], b.blobs.color[best * 3 + 2]]
  }
  const plain = buildVoxels(spec()), mirror = buildVoxels(spec({ see: 0, mirror: 0.8, top: true })), clear = buildVoxels(spec({ see: 0.8, mirror: 0, top: true }))
  // on the water just in front of the post, the mirror line runs back up into it
  const front: [number, number, number] = [0, 0, 0.1]
  assert.ok(near(mirror, ...front)[0] - near(mirror, ...front)[1] > near(plain, ...front)[0] - near(plain, ...front)[1] + 0.2, 'red in the water')
  // out to the side the mirror line meets only sky
  assert.ok(near(mirror, 0.8, 0, 0.6)[2] > near(plain, 0.8, 0, 0.6)[2] + 0.1, 'sky in the water')
  // looking in, nothing is met before the line leaves the water: a darker step of its own color
  assert.ok(near(clear, 0.6, 0, 0.6)[1] < near(plain, 0.6, 0, 0.6)[1] - 0.05, 'deep water is darker')
  // the sides are earth, not glass
  assert.deepEqual(near(mirror, 0, -0.2, 1), near(plain, 0, -0.2, 1))
})

test('bounce, form dabs and focus: a red wall warms the floor by it, strokes run round a trunk, and out of focus is a coarser grid with no holes', () => {
  const at = (b: ReturnType<typeof buildVoxels>, x: number, y: number, z: number) => {
    let best = -1, d = Infinity
    for (let i = 0; i < b.blobs.count; i++) {
      const e = Math.hypot(b.blobs.center[i * 3] - x, b.blobs.center[i * 3 + 1] - y, b.blobs.center[i * 3 + 2] - z)
      if (e < d) { d = e; best = i }
    }
    return { i: best, d, c: [b.blobs.color[best * 3], b.blobs.color[best * 3 + 1], b.blobs.color[best * 3 + 2]] }
  }
  const room = (bounce: number): VoxelSpec => ({
    bones: [ROOT], spacing: 0.04, light: { ambient: 0.5, shadow: 0, bounce },
    parts: [{ shape: box([0, -0.1, 0], [1, 0.1, 1]), color: [0.7, 0.7, 0.7], bone: 'root' }, { shape: box([0, 0.5, -0.7], [1, 0.5, 0.1]), color: [1, 0.1, 0.1], bone: 'root' }],
  })
  const flat = buildVoxels(room(0)), warm = buildVoxels(room(1))
  const red = (b: typeof flat, z: number) => { const { c } = at(b, 0, 0, z); return c[0] - c[1] }
  assert.ok(red(warm, -0.5) > red(flat, -0.5) + 0.05, 'by the wall')
  assert.ok(red(warm, 0.8) - red(flat, 0.8) < red(warm, -0.5) - red(flat, -0.5), 'less far from it')
  // strokes round an upright trunk: long along the level line, which is level
  const trunk = buildVoxels({ bones: [ROOT], spacing: 0.04, parts: [{ shape: cylinder([0, 0], 0, 1, 0.3), color: [0.5, 0.4, 0.3], bone: 'root', strokes: 0.8 }] })
  const { i } = at(trunk, 0.3, 0.5, 0)
  assert.ok(trunk.blobs.scale[i * 3] > trunk.blobs.scale[i * 3 + 1] * 1.5)
  const q = trunk.blobs.quat.subarray(i * 4, i * 4 + 4)
  // the local x axis, turned into the world: level, and across the face (along z here)
  const xw = [1 - 2 * (q[1] * q[1] + q[2] * q[2]), 2 * (q[0] * q[1] + q[2] * q[3]), 2 * (q[0] * q[2] - q[1] * q[3])]
  assert.ok(Math.abs(xw[1]) < 0.05 && Math.abs(xw[2]) > 0.9, JSON.stringify(xw))
  // focus: a floor with the eye on one corner
  const floor = (focus?: VoxelSpec['focus']) => buildVoxels({ bones: [ROOT], spacing: 0.04, focus, parts: [{ shape: box([0, -0.2, 0], [1, 0.2, 1]), color: [0.5, 0.5, 0.5], bone: 'root' }] })
  const all = floor(), eyed = floor({ at: [-0.6, 0, -0.6], r: 0.4 })
  assert.ok(eyed.blobs.count < all.blobs.count * 0.45, `${eyed.blobs.count} of ${all.blobs.count}`)
  assert.ok(at(eyed, -0.62, 0, -0.58).d < 0.03, 'fine in focus')
  // out of focus every point of the top still has a disc within reach of its wider radius
  for (let x = 0; x < 0.9; x += 0.037) for (let z = 0; z < 0.9; z += 0.041) {
    const { i: k, d } = at(eyed, x, 0, z)
    assert.ok(d < eyed.blobs.scale[k * 3] * 1.3, `hole at ${x.toFixed(2)}, ${z.toFixed(2)}`)
  }
})

test('painted in steps: every lit blob takes a palette color of its own paint\'s ramp, in flat bands; glow keeps its color', () => {
  const greens: [number, number, number][] = [[0.08, 0.16, 0.12], [0.18, 0.36, 0.2], [0.36, 0.6, 0.28], [0.62, 0.82, 0.4]]
  const reds: [number, number, number][] = [[0.3, 0.08, 0.1], [0.62, 0.16, 0.14], [0.9, 0.36, 0.26]]
  const palette = [...greens, ...reds, [1, 1, 0.9] as [number, number, number]]
  const spec = (steps: boolean): VoxelSpec => ({
    bones: [ROOT], spacing: 0.05,
    parts: [
      { shape: sphere([-1.2, 0, 0], 1), color: [0.3, 0.55, 0.26], bone: 'root' },
      { shape: sphere([1.2, 0, 0], 1), color: [0.7, 0.2, 0.16], bone: 'root' },
      { shape: sphere([0, 1.6, 0], 0.2), color: [1, 0.9, 0.5], bone: 'root', glow: true },
    ],
    light: { ...PAINTED, ...(steps ? { steps: { palette } } : {}) },
  })
  const key = (c: ArrayLike<number>, i = 0) => `${c[i].toFixed(3)},${c[i + 1].toFixed(3)},${c[i + 2].toFixed(3)}`
  const smooth = buildVoxels(spec(false)), stepped = buildVoxels(spec(true))
  assert.equal(stepped.blobs.count, smooth.blobs.count, 'the same cells either way')
  const seen = [new Set<string>(), new Set<string>(), new Set<string>()]
  const plain = [new Set<string>(), new Set<string>()]
  for (let i = 0; i < stepped.blobs.count; i++) {
    seen[stepped.partOf[i]].add(key(stepped.blobs.color, i * 3))
    if (smooth.partOf[i] < 2) plain[smooth.partOf[i]].add(key(smooth.blobs.color, i * 3))
  }
  const names = (cs: [number, number, number][]) => new Set(cs.map((c) => key(c)))
  // the green ball is only ever a green, the red one a red: shade does not turn one paint into another
  for (const c of seen[0]) assert.ok(names(greens).has(c), `green ball in ${c}`)
  for (const c of seen[1]) assert.ok(names(reds).has(c), `red ball in ${c}`)
  // bands, from shade to sun: a few steps where the smooth build has hundreds of colors
  assert.ok(seen[0].size >= 3 && seen[1].size >= 2, `${seen[0].size} greens, ${seen[1].size} reds`)
  assert.ok(plain[0].size > 100)
  // the glowing part is left as it was
  assert.deepEqual([...seen[2]], [key([1, 0.9, 0.5])])
  // a palette color over the glow line is held under it, so nothing painted glows
  const white = buildVoxels({ bones: [ROOT], spacing: 0.1, parts: [{ shape: sphere([0, 0, 0], 0.5), color: [1, 1, 1], bone: 'root' }], light: { steps: { palette: [[1, 1, 1], [0.2, 0.2, 0.3]], mottle: 0 } } })
  for (let i = 0; i < white.blobs.count * 3; i++) assert.ok(white.blobs.color[i] <= LIT_MAX + 1e-6)
})

test('painting in steps keeps a paint in its own hue: a red with no darker red stays red in shade, not brown', () => {
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number]
  const palette = ['#2a1c16', '#4a3020', '#8f2d1c', '#d9541e', '#7b2f45', '#b9485a', '#10241c', '#1b3a2a', '#2c5a38'].map(hex)
  const light = { ...PAINTED, dir: [0, 1, 0] as [number, number, number], ambient: 0.5, shadow: 0.7, steps: { palette, mottle: 0 } }
  const step = stepper(light.steps, light)
  const at = (paint: string, t: number) => { const base = hex(paint); return step(base, bakedColor(base, (0.5 + 0.5 * t) * LIT_MAX, t, light.ramp, 0), 0, 0, 0) }
  const red = hex('#7b2f45'), pink = hex('#b9485a')
  for (let q = 0; q <= 8; q++) {
    assert.deepEqual(at('#7b2f45', q / 8), red, `dark red at ${q / 8}`)
    assert.ok([red, pink].some((c) => c.every((v, k) => v === at('#b9485a', q / 8)[k])), `light red at ${q / 8}`)
  }
  // a green still runs through its greens
  assert.ok(new Set([0, 0.5, 1].map((t) => at('#2c5a38', t).join())).size >= 2)
})

test('painting in steps keeps a gray paint in grays: white sails in shade never take the sky\'s pale blue', () => {
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number]
  // the windmill's palette, light and white sail paint
  const palette = [
    '#22202b', '#3b2a20', '#5e4230', '#8a6242', '#b98d60', '#2f5d34', '#4a8a3c', '#76b04a', '#a8d05e', '#b88a2e', '#e0b648', '#f3d977',
    '#ffd84a', '#5a5863', '#8b8894', '#bdbac4', '#ebe8e2', '#fbf7ea', '#8c2f2a', '#c4483a', '#e58fa8', '#2e62a8', '#3b6fb5', '#5fa8e0', '#9fd0ee', '#dff1f8',
  ].map(hex)
  const light = { ...PAINTED, dir: [0.4, 0.8, 0.6] as [number, number, number], ambient: 0.7, shadow: 0.5, steps: { palette } }
  const step = stepper(light.steps, light)
  // palette colors as the steps give them, held under the glow line
  const held = (c: number[]) => { const top = Math.max(...c); return c.map((v) => (top > LIT_MAX ? (v * LIT_MAX) / top : v)) }
  const blues = new Set(['#5fa8e0', '#9fd0ee', '#dff1f8'].map((h) => held(hex(h)).join()))
  for (const paint of ['#fbf7ea', '#bdbac4'])
    for (let q = 0; q <= 12; q++)
      for (let i = 0; i < 30; i++) {
        const base = hex(paint), t = q / 12
        const got = step(base, bakedColor(base, (0.7 + 0.3 * t) * LIT_MAX, t, light.ramp, 0), i * 3, i, 7 - i)
        assert.ok(!blues.has(got.join()), `${paint} at ${t} took a blue`)
      }
})

test('light in bands: a sun share falls on one of a few steps, and a lit ball takes only that many shades', () => {
  assert.equal(bandOf(0.2, 3), 0)
  assert.equal(bandOf(0.5, 3), 0.5)
  assert.equal(bandOf(0.9, 3), 1)
  assert.equal(bandOf(1, 3), 1)
  assert.equal(bandOf(0.42, 0), 0.42)
  const ball = () => buildVoxels({ bones: [ROOT], parts: [{ shape: sphere([0, 0, 0], 0.5), color: [0.8, 0.6, 0.4], bone: 'root' }], spacing: 0.05, light: { dir: [0.3, 0.8, 0.5], ambient: 0.4, shadow: 0 } }).blobs
  const shades = (b: ReturnType<typeof ball>) => { const seen = new Set<string>(); for (let i = 0; i < b.count; i++) seen.add([...b.color.subarray(i * 3, i * 3 + 3)].map((v) => v.toFixed(4)).join()); return seen.size }
  const smooth = shades(ball()), stepped = shades(banded(3, ball))
  assert.ok(smooth > 20, `${smooth}`)
  assert.equal(stepped, 3)
})

test('discs along an outer edge are fitted to it: on a round table top none reaches past the rim, and most discs are untouched', () => {
  const s = 0.05, r = 0.53
  const make = () => buildVoxels({ bones: [ROOT], parts: [{ shape: cylinder([0, 0], 0, 0.2, r), color: [1, 1, 1], bone: 'root' }], spacing: s }).blobs
  const plain = make(), fitted = hugged(make)
  assert.equal(plain.count, fitted.count)
  const past = (b: ReturnType<typeof make>) => {
    let n = 0
    for (let i = 0; i < b.count; i++) {
      const [x, y, z] = b.center.subarray(i * 3, i * 3 + 3), [qx, qy, qz, qw] = b.quat.subarray(i * 4, i * 4 + 4), sc = b.scale.subarray(i * 3, i * 3 + 3)
      const ax0 = [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy + qz * qw), 2 * (qx * qz - qy * qw)], ax1 = [2 * (qx * qy - qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz + qx * qw)]
      const nUp = Math.abs(ax0[2] * ax1[0] - ax0[0] * ax1[2])
      const d = Math.hypot(x, z)
      // discs of the top face, near the rim
      if (y < 0.15 || nUp < 0.9 || d < r - 2 * s) continue
      const u = [x / d, 0, z / d]
      const reach = 1.18 * Math.hypot((ax0[0] * u[0] + ax0[2] * u[2]) * sc[0], (ax1[0] * u[0] + ax1[2] * u[2]) * sc[1])
      if (d + reach > r + s * 0.2) n++
    }
    return n
  }
  let moved = 0
  for (let i = 0; i < fitted.count * 3; i++) if (fitted.center[i] !== plain.center[i]) moved++
  assert.ok(past(plain) > 0)
  assert.equal(past(fitted), 0)
  assert.ok(moved > 0 && moved < fitted.count, `${moved} of ${fitted.count}`)
})
