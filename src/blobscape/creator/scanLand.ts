/**
 * A splat scan as the land (#381): leveled and cleaned as Scan Studio does on opening (its table found and turned
 * level, faint, huge and floating blobs dropped, the table kept, since here it is the ground), set across the land's
 * usual width, with a ground props stand on read from its blobs. The cut takes its scanned light out and lights it
 * with the scene's (scan/delight.ts, #463). Pure, tested.
 */
import { Blobs, type Vec3 } from '../../splat-core/blobs.ts'
import type { SceneProject } from '../../splat-engine/project.ts'
import type { Shape } from '../../splat-engine/voxel.ts'
import { extent, keepOnly } from '../scan/clean.ts'
import { DEFAULT_CLEAN, UNTURNED, autoOrient, cleanMasks, working } from '../scan/studio.ts'

/** How wide a scan is set across, its wider way: the width of the plain lands. */
export const SCAN_SPAN = 3

/** The scan leveled, cleaned and set on y = 0 (its table, where one was found), centered and `SCAN_SPAN` across. */
export function landFromScan(raw: Blobs): Blobs {
  const { blobs } = working(raw, autoOrient(raw) ?? UNTURNED)
  const { all } = cleanMasks(blobs, { ...DEFAULT_CLEAN, floor: 0 })
  const out = all ? keepOnly(blobs, all) : blobs
  if (!out.count) return out
  const { lo, hi } = extent(out)
  const wide = Math.max(hi[0] - lo[0], hi[2] - lo[2])
  const s = wide > 0 ? SCAN_SPAN / wide : 1
  const mid = [(lo[0] + hi[0]) / 2, (lo[2] + hi[2]) / 2]
  for (let i = 0; i < out.count; i++) {
    out.center[i * 3] = (out.center[i * 3] - mid[0]) * s
    out.center[i * 3 + 1] *= s
    out.center[i * 3 + 2] = (out.center[i * 3 + 2] - mid[1]) * s
    for (let k = 0; k < 3; k++) out.scale[i * 3 + k] *= s
  }
  return out
}

/** The side of a cell of a scan's ground. */
export const SCAN_CELL = 0.05
/** Blobs fainter than this are not ground. */
const SOLID = 0.3

/**
 * The ground a scan's props stand on: over each cell, the top of the solid blobs there (a table, the top of a mug), or
 * y = 0 where none are. Only ever asked straight down a column (`groundUnder`), where how far above that top a point
 * is is its distance.
 */
export function scanGround(b: Blobs, cell = SCAN_CELL): Shape {
  const { lo, hi } = extent(b)
  const nx = Math.max(1, Math.ceil((hi[0] - lo[0]) / cell) + 1), nz = Math.max(1, Math.ceil((hi[2] - lo[2]) / cell) + 1)
  const top = new Float32Array(nx * nz).fill(-Infinity)
  for (let i = 0; i < b.count; i++) {
    if (b.opacity[i] < SOLID) continue
    const x = Math.floor((b.center[i * 3] - lo[0]) / cell), z = Math.floor((b.center[i * 3 + 2] - lo[2]) / cell)
    const k = z * nx + x
    if (b.center[i * 3 + 1] > top[k]) top[k] = b.center[i * 3 + 1]
  }
  let most = 0
  for (const t of top) if (t > most) most = t
  const at = (x: number, z: number): number => {
    const i = Math.floor((x - lo[0]) / cell), j = Math.floor((z - lo[2]) / cell)
    const t = i >= 0 && j >= 0 && i < nx && j < nz ? top[j * nx + i] : -Infinity
    return Number.isFinite(t) ? Math.max(0, t) : 0
  }
  return {
    sdf: (x, y, z) => y - at(x, z),
    min: [lo[0], -0.01, lo[2]] as Vec3,
    max: [hi[0], most + 0.01, hi[2]] as Vec3,
  }
}

/** A new project with a scan for its land (a model id, `scan` on the model) and nothing on it yet. */
export function scanProject(id: string, name: string): SceneProject {
  return {
    kind: 'blobscape-project', version: 1, name, loop: 12, land: id, props: [],
    camera: { target: [0, 0.3, 0], distance: SCAN_SPAN * 1.5, azimuth: 24, elevation: 22 },
  }
}
