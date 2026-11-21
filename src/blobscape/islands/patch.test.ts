import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PATCH_HALF, PATCH_MOVE, inHole, patchAt, patchFor, patchOf } from './patch.ts'
import { box, buildVoxels, within } from '../../splat-engine/voxel.ts'
import type { Bone } from '../../splat-engine/rig.ts'

const ROOT: Bone = { name: 'root', parent: -1, head: [0, 0, 0], tail: [0, 1, 0] }

test('the patch stays put until the elf has gone some way, then moves round it on whole steps', () => {
  assert.deepEqual(patchAt(1.4, -2.6), [1, -3])
  let at: [number, number] = [0, 0], moves = 0
  for (let x = 0; x <= 20; x += 0.1) { const next = patchFor(at, x, 0); if (next !== at) moves++; at = next; assert.ok(Math.abs(x - at[0]) <= PATCH_MOVE) }
  // a move every PATCH_MOVE or so, never a move a step
  assert.ok(moves <= Math.ceil(20 / PATCH_MOVE), `${moves} moves`)
  assert.ok(PATCH_HALF - PATCH_MOVE >= 1.4, 'fine ground beyond the elf')
})

test('a finer patch fills the coarse cut’s hole with no gap, overlapping it by at most half a fine cell', () => {
  // a slab of ground, cut coarse with a hole and fine in the hole: every place on its top has a block over it once,
  // or twice only in the half fine cell along the seam
  const coarse = 0.2, fine = 0.1, at: [number, number] = [2, -2]
  const spec = { bones: [ROOT], parts: [{ shape: box([2, 0, -2], [6, 0.3, 6]), color: [0.4, 0.6, 0.3] as [number, number, number], bone: 'root' }] }
  const p = patchOf(at, coarse, fine)
  const big = buildVoxels({ ...spec, spacing: coarse }).blobs, small = within(p.region, () => buildVoxels({ ...spec, spacing: fine })).blobs
  const tops = (b: typeof big, cell: number, keep: (x: number, z: number) => boolean) => {
    const out: [number, number, number][] = []
    for (let i = 0; i < b.count; i++) { const x = b.center[i * 3], y = b.center[i * 3 + 1], z = b.center[i * 3 + 2]; if (y > 0.15 && b.opacity[i] > 0 && keep(x, z)) out.push([x, z, cell]) }
    return out
  }
  const cubes = [...tops(big, coarse, (x, z) => !inHole(p, coarse, x, z)), ...tops(small, fine, () => true)]
  assert.ok(small.count > 0 && small.count < big.count * 4)
  // the cubes by the coarse cell their middle is in, so a point looks only at those round it
  const cells = new Map<string, typeof cubes>()
  for (const c of cubes) { const k = `${Math.floor(c[0] / coarse)} ${Math.floor(c[1] / coarse)}`; cells.set(k, [...(cells.get(k) ?? []), c]) }
  const nearby = (x: number, z: number) => {
    const out: typeof cubes = [], i = Math.floor(x / coarse), j = Math.floor(z / coarse)
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) out.push(...(cells.get(`${i + a} ${j + b}`) ?? []))
    return out
  }
  for (let x = at[0] - PATCH_HALF - 1; x <= at[0] + PATCH_HALF + 1; x += 0.037) {
    for (let z = at[1] - PATCH_HALF - 1; z <= at[1] + PATCH_HALF + 1; z += 0.041) {
      // a little loose for gaps and a little tight for doubles, so a point on the line between two cubes is neither
      const near = nearby(x, z)
      const under = (e: number) => near.filter(([cx, cz, c]) => Math.abs(x - cx) <= c / 2 + e && Math.abs(z - cz) <= c / 2 + e).length
      assert.ok(under(1e-4) >= 1, `a gap at ${x.toFixed(2)}, ${z.toFixed(2)}`)
      const over = under(-1e-4)
      if (over > 1) assert.ok(Math.abs(x - p.region.min[0]) < fine || Math.abs(x - p.region.max[0]) < fine || Math.abs(z - p.region.min[2]) < fine || Math.abs(z - p.region.max[2]) < fine, `doubled away from the seam at ${x.toFixed(2)}, ${z.toFixed(2)}`)
    }
  }
})
