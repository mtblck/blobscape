import type { Orbit } from '../../splat-core/orbit.ts'
import type { PixelLook } from '../../splat-core/pixel.ts'
import type { Built } from '../../splat-engine/body.ts'
import type { Light } from '../../splat-engine/engine.ts'
import type { Skeleton } from '../../splat-engine/rig.ts'
import { buildVoxels } from '../../splat-engine/voxel.ts'
import { DETAIL } from '../diorama/scene.ts'
import * as meadow from './meadow/build.ts'
import * as camp from './scene.ts'

/** One of the panels the page draws and finishes itself: it gives the scene drawn small, RGBA, bottom row first. */
export interface Drawn {
  draw(t: number, orbit: Orbit, width: number, height: number, gain: number, fov: number): Uint8Array
  dispose(): void
}

/** A scene the page can show four ways. The Blobscape and Spark panels use `build`, `pose` and `lights`; the other two are written by hand. */
export interface FourScene {
  id: string
  label: string
  /** What the four tries are at, for the cards' heading: "one camp". */
  subject: string
  /** The page's line about the scene, and the view's label for a screen reader. */
  intro: string
  viewLabel: string
  orbit: Orbit
  look: PixelLook
  palette: [number, number, number][]
  haze?: { color: [number, number, number]; from: number; to: number }
  /** The slider that turns the scene's live light up and down, and what it says underneath. */
  slider: { label: string; hint: string }
  /** How much of its painted color everything keeps before the live lights add theirs. */
  ambient: number
  /** Whether the live light casts shadows that follow what moves (where the engine has compute passes). */
  shadows: boolean
  /** Cuts and builds the scene's blobs; `coarse` for a phone. */
  build(coarse: boolean): Built
  pose(built: Built, sk: Skeleton, t: number): void
  lights(t: number, gain: number, shadows: boolean): Light[]
  /** The moments whose light is averaged and painted into Spark's colors. */
  paintedAt: number[]
  shader(): Promise<Drawn>
  meshes(): Promise<Drawn>
  /** Blobscape's own count of what it made, for the line under the view. */
  made(built: Built): string
}

export const SCENES: FourScene[] = [
  {
    id: 'fox', label: 'Fox and wisp', subject: 'one fox',
    intro: 'A fox trotting through tall grass while a wisp of light circles it, drawn at the same moment by four different things: a shader written with no engine, three.js meshes, Spark’s splats, and Blobscape.',
    viewLabel: 'A fox trotting a ring through tall grass round a standing stone at night, while a small light circles it, drawn four ways side by side.',
    orbit: meadow.SCENE.orbit, look: meadow.SCENE.look, palette: meadow.SCENE.palette, haze: meadow.SCENE.haze,
    slider: { label: 'Wisp', hint: 'How bright the wisp shines. Three of the four light the meadow afresh every frame, so the light and its shadows go round with it. Spark’s splats had the light painted in when they were made.' },
    shadows: true, ambient: meadow.AMBIENT,
    build: (coarse) => meadow.buildMeadow(DETAIL[coarse ? 0 : 1].spacing, coarse ? 12000 : 30000, coarse ? 3500 : 8000),
    pose: (built, sk, t) => meadow.poseMeadow(built as meadow.Meadow, sk, t),
    lights: meadow.lightsAt,
    // Spark cannot move a light, so its colors take the wisp's light from all round the ring
    paintedAt: Array.from({ length: 24 }, (_, k) => (k * meadow.LOOP) / 24),
    shader: async () => new (await import('./meadow/shader.ts')).MeadowShader(),
    meshes: async () => new (await import('./meadow/meshes.ts')).MeadowMeshes(),
    made: (built) => { const c = (built as meadow.Meadow).counts; return `${c.fox.toLocaleString()} for the fox and its fur, ${c.grass.toLocaleString()} for the grass` },
  },
  {
    id: 'campfire', label: 'Campfire', subject: 'one camp',
    intro: 'A campfire, drawn at the same moment by four different things: a shader written with no engine, three.js meshes, Spark’s splats, and Blobscape.',
    viewLabel: 'A camp in a clearing among pines at night, with a flickering fire, a tent, a lantern and fireflies, drawn four ways side by side.',
    orbit: camp.SCENE.orbit, look: camp.SCENE.look, palette: camp.SCENE.palette, haze: camp.SCENE.haze,
    slider: { label: 'Fire', hint: 'How bright the fire burns. Three of the four light the camp afresh every frame, so they follow. Spark’s splats had the light painted in when they were made.' },
    shadows: false, ambient: 1,
    build: (coarse) => buildVoxels(camp.SCENE.spec(DETAIL[coarse ? 0 : 1].spacing)),
    pose: (_built, sk, t) => camp.SCENE.pose(sk, t),
    lights: (t, gain) => camp.lightsAt(t, gain),
    paintedAt: [0],
    shader: async () => new (await import('./shader.ts')).ShaderPanel(),
    meshes: async () => new (await import('./meshes.ts')).MeshPanel(),
    made: () => '',
  },
]

export const sceneOf = (id: string | null) => SCENES.find((s) => s.id === id) ?? SCENES[0]
