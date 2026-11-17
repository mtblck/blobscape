import type { Vec3 } from '../../splat-core/blobs.ts'
import { checkScene, compileScene, type SceneDoc } from '../../splat-engine/sceneDoc.ts'
import { fitMesh, meshColor, meshShape, type Texture } from '../../splat-engine/meshShape.ts'
import type { MeshFile } from '../../splat-engine/meshFile.ts'
import { buildVoxels } from '../../splat-engine/voxel.ts'
import { described, type Diorama } from './scenes.ts'

/**
 * A model someone opens (issue #164) as a Pixel Diorama scene: the mesh fitted to stand on a round plinth, turning
 * once a loop, cut through `meshShape` like any described part, painted from its own colors and texture, in a
 * palette picked from those colors at a few levels of light. Pure apart from what the page hands it.
 */

/** How tall or wide the model stands, in scene units. */
export const MODEL_SIZE = 1.3
const LOOP = 12
const GROUND = ['#2a2a30', '#4a4a52', '#76767e']

const hex = (c: Vec3) => '#' + c.map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0')).join('')

/** Colors on the model's surface, about `n` of them, read where triangles are and weighed by their area. */
export function surfaceColors(file: MeshFile, textures: Texture[], n = 600): Vec3[] {
  const { positions: P, indices: I, colors: C, uvs: U, tex } = file.mesh
  const tris = I.length / 3
  const area = new Float64Array(tris)
  let total = 0
  for (let t = 0; t < tris; t++) {
    const [a, b, c] = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]]
    const u = [0, 1, 2].map((k) => P[b * 3 + k] - P[a * 3 + k]), v = [0, 1, 2].map((k) => P[c * 3 + k] - P[a * 3 + k])
    total += area[t] = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
  }
  const out: Vec3[] = []
  // a fixed walk through the triangles by area, and a fixed spread of points inside each
  let acc = 0, next = total / n / 2, s = 0.37
  for (let t = 0; t < tris && out.length < n; t++) {
    acc += area[t]
    while (acc >= next && out.length < n) {
      next += total / n
      s = (s * 9301 + 0.49297) % 1
      let wb = s, wc = (s * 7.31) % 1
      if (wb + wc > 1) { wb = 1 - wb; wc = 1 - wc }
      const wa = 1 - wb - wc, [a, b, c] = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]]
      let col: Vec3 = C ? [0, 1, 2].map((k) => C[a * 3 + k] * wa + C[b * 3 + k] * wb + C[c * 3 + k] * wc) as Vec3 : [0.8, 0.8, 0.8]
      const tx = tex && U ? textures[tex[t]] : undefined
      if (tx && U) {
        const tc = tx(U[a * 2] * wa + U[b * 2] * wb + U[c * 2] * wc, U[a * 2 + 1] * wa + U[b * 2 + 1] * wb + U[c * 2 + 1] * wc)
        col = [col[0] * tc[0], col[1] * tc[1], col[2] * tc[2]]
      }
      out.push(col)
    }
  }
  return out
}

/** About `k` colors that stand for `colors` lit, half lit and in shade (k-means from a spread start, fixed steps). */
export function modelPalette(colors: Vec3[], k = 22): string[] {
  const pts: Vec3[] = []
  for (const c of colors) for (const l of [0.42, 0.72, 1.05]) pts.push([c[0] * l, c[1] * l, c[2] * l])
  if (!pts.length) return []
  const seeds: Vec3[] = [pts[0]]
  const d2 = (a: Vec3, b: Vec3) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
  while (seeds.length < Math.min(k, pts.length)) {
    let best = 0, at = 0
    for (let i = 0; i < pts.length; i++) {
      let m = Infinity
      for (const s of seeds) m = Math.min(m, d2(pts[i], s))
      if (m > best) { best = m; at = i }
    }
    if (best < 1e-5) break
    seeds.push(pts[at])
  }
  for (let step = 0; step < 8; step++) {
    const sum = seeds.map(() => [0, 0, 0, 0])
    for (const p of pts) {
      let at = 0, m = Infinity
      seeds.forEach((s, i) => { const d = d2(p, s); if (d < m) { m = d; at = i } })
      for (let c = 0; c < 3; c++) sum[at][c] += p[c]
      sum[at][3]++
    }
    sum.forEach((s, i) => { if (s[3]) seeds[i] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]] })
  }
  return [...new Set(seeds.map(hex))]
}

/** The opened model as a scene. `name` is the file's name, shown on its chip. */
export function modelDiorama(name: string, file: MeshFile, textures: Texture[]): Diorama {
  const mesh = fitMesh(file.mesh, MODEL_SIZE)
  // the dark and light ends always there, for outlines, shade and the plinth
  const palette = [...new Set(['#101014', ...GROUND, '#f4f4f0', ...modelPalette(surfaceColors({ ...file, mesh }, textures))])].slice(0, 32)
  const top = mesh.positions.reduce((m, v, i) => (i % 3 === 1 ? Math.max(m, v) : m), 0)
  const doc: SceneDoc = {
    name: name.replace(/\.[^.]+$/, '').slice(0, 24) || 'Your model',
    loop: LOOP,
    light: { from: [0.5, 1, 0.6], ambient: 0.55, shadow: 0.5 },
    palette,
    sky: ['#1c1c24', '#4a4a58'],
    look: { dither: 0.05, glow: 1, outline: true, edges: true },
    disc: 0.75,
    camera: { target: [0, top * 0.5, 0], distance: 3.2 + top * 0.6, azimuth: 30, elevation: 14 },
    bones: [{ name: 'model', at: [0, 0, 0] }],
    parts: [{ shape: { kind: 'cylinder', at: [0, -0.08, 0], height: 0.08, r: MODEL_SIZE * 0.62 }, paint: { kind: 'faces', top: GROUND[2], side: GROUND[1] } }],
    moves: [{ kind: 'spin', bone: 'model', axis: 'y', times: 1 }],
  }
  const problems = checkScene(doc)
  if (problems.length) throw new Error(problems.join('; '))
  const compiled = compileScene(doc)
  return {
    ...described('model', doc, `A model opened from ${name}, turning on a plinth`),
    make(spacing, steps) {
      const spec = compiled.spec(spacing, steps)
      // half a cell: fine enough that a thin part of the model keeps its own distance
      const shape = meshShape(mesh, spacing * 0.5)
      spec.parts.push({ shape, color: meshColor(mesh, shape, undefined, textures), bone: 'model' })
      return buildVoxels(spec)
    },
  }
}
