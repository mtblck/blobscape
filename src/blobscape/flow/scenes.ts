import { Mpm, type Material } from '../../splat-engine/mpm.ts'

/**
 * What Sand, Snow and Goo starts with and what a pour drops in. The box is
 * [0, 1] each way (mpm.ts); `at` is where a pour lands, across the floor.
 */

/** The most particles the box holds. Every one is a blob, so the view keeps this many and hides the unused. */
export const CAPACITY = 6000

export type Shape = 'column' | 'block' | 'drop'
export interface Pour { material: Material; shape: Shape; at: [number, number] }

export const SHAPES: { id: Shape; label: string; note: string }[] = [
  { id: 'column', label: 'Column', note: 'A tall, narrow column, standing on the floor.' },
  { id: 'block', label: 'Block', note: 'A low, wide block, standing on the floor.' },
  { id: 'drop', label: 'Drop', note: 'A small cube dropped from high up.' },
]

export interface Scene { id: string; label: string; note: string; pours: Pour[] }
export const SCENES: Scene[] = [
  {
    id: 'three', label: 'Three columns', note: 'A column of each, side by side: see which stands.',
    pours: [{ material: 'sand', shape: 'column', at: [0.25, 0.5] }, { material: 'snow', shape: 'column', at: [0.5, 0.5] }, { material: 'goo', shape: 'column', at: [0.75, 0.5] }],
  },
  { id: 'heap', label: 'Sand heap', note: 'One tall column of sand, which runs into a heap.', pours: [{ material: 'sand', shape: 'column', at: [0.5, 0.5] }] },
  {
    id: 'snowball', label: 'Snow on goo', note: 'A bed of goo with snow dropped on it.',
    pours: [{ material: 'goo', shape: 'block', at: [0.5, 0.5] }, { material: 'snow', shape: 'drop', at: [0.5, 0.5] }],
  },
]

/** Box corners for a pour. */
export function pourBox(p: Pour): [lo: [number, number, number], hi: [number, number, number]] {
  const [x, z] = p.at
  const half = p.shape === 'column' ? 0.07 : p.shape === 'block' ? 0.2 : 0.06
  const [y0, y1] = p.shape === 'column' ? [0.05, 0.45] : p.shape === 'block' ? [0.05, 0.15] : [0.6, 0.72]
  const c = (v: number) => Math.min(0.92 - half, Math.max(0.08 + half, v))
  return [[c(x) - half, y0, c(z) - half], [c(x) + half, y1, c(z) + half]]
}

/** Fills a pour into the box. Returns true when the box is full (some or all of it didn't fit). */
export function pour(sim: Mpm, p: Pour, seed: number): boolean {
  const [lo, hi] = pourBox(p)
  sim.fillBox(lo, hi, p.material, seed)
  return sim.count >= sim.capacity
}
