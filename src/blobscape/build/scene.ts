import type { Vec3 } from '../../splat-core/blobs.ts'
import { checkScene, compileScene, type CompiledScene, type SceneDoc } from '../../splat-engine/sceneDoc.ts'

/**
 * Lesson 23's scene: a cottage at dusk written as data, the text the visitor edits, and what the lesson reads from
 * it. Pure and tested.
 */

/** Where the lantern hangs: a light near it lights it. */
export const LANTERN: Vec3 = [0.35, 0.56, 0.55]
/** How near a light must sit to the lantern to be its light. */
export const NEAR_LANTERN = 0.35
/** The grid the lesson cuts the scene on. */
export const SCENE_SPACING = 0.028

export const SCENE_START: SceneDoc = {
  name: 'Cottage at dusk',
  loop: 12,
  light: { from: [-0.5, 0.6, 0.6], ambient: 0.45 },
  palette: ['#141a33', '#2a2f55', '#4a4f7a', '#2c4a2a', '#4a7a3a', '#7aa84e', '#4a3020', '#6e4a2e', '#a07850', '#d8c09a', '#8a2f2a', '#c0503a', '#ffd166', '#fff3b0'],
  sky: ['#141a33', '#c0503a'],
  look: { dither: 0.1, glow: 1.5, outline: true, edges: true },
  camera: { target: [0, 0.45, 0], distance: 3.6, azimuth: 25, elevation: 18 },
  bones: [{ name: 'tree', at: [0.75, 0, -0.25] }],
  parts: [
    { shape: { kind: 'cylinder', at: [0, -0.2, 0], height: 0.2, r: 1.2 }, paint: { kind: 'faces', top: { kind: 'patches', size: 0.3, colors: ['#4a7a3a', '#7aa84e'] }, side: '#6e4a2e' } },
    { shape: { kind: 'box', at: [-0.3, 0.25, 0], half: [0.35, 0.25, 0.28] }, paint: { kind: 'bricks', size: [0.12, 0.06], colors: ['#d8c09a', '#a07850'], line: '#6e4a2e' } },
    { shape: { kind: 'roof', at: [-0.3, 0.5, 0], half: [0.42, 0.34], height: 0.3 }, paint: '#8a2f2a' },
    { shape: { kind: 'box', at: [-0.3, 0.14, 0.28], half: [0.07, 0.14, 0.02] }, paint: '#4a3020' },
    { shape: { kind: 'box', at: [-0.08, 0.3, 0.28], half: [0.06, 0.06, 0.02] }, paint: '#ffd166', glow: true },
    { shape: { kind: 'cylinder', at: [0.75, 0, -0.25], height: 0.45, r: 0.05 }, paint: '#6e4a2e', bone: 'tree' },
    { shape: { kind: 'ball', at: [0.75, 0.62, -0.25], r: [0.28, 0.3, 0.28] }, paint: { kind: 'speckle', size: 0.05, colors: ['#2c4a2a', '#4a7a3a', '#7aa84e'] }, bone: 'tree' },
    { shape: { kind: 'cylinder', at: [0.35, 0, 0.55], height: 0.5, r: 0.02 }, paint: '#2a2f55' },
    { shape: { kind: 'box', at: LANTERN, half: [0.045, 0.055, 0.045] }, paint: '#ffd166', glow: true },
  ],
}

/** What the lesson's goals ask of a description, solved: for the tests and the code check. */
export const SCENE_SOLVED: SceneDoc = {
  ...SCENE_START,
  moves: [{ kind: 'sway', bone: 'tree', axis: 'z', degrees: 4, times: 3 }],
  lights: [{ at: [0.35, 0.56, 0.62], color: '#ffd166', strength: 1.2, range: 1.2, flicker: { by: 0.3, times: 24 } }],
}

/** The description as the visitor sees it: JSON, two spaces in, with anything short kept on one line. */
export function docText(doc: SceneDoc): string {
  return fmt(doc, '')
}

const WIDE = 100

function fmt(v: unknown, pad: string, lead = 0): string {
  const flat = oneLine(v)
  const plain = Array.isArray(v) && v.every((x) => typeof x !== 'object' || x === null)
  if (plain || flat.length + pad.length + lead <= WIDE || typeof v !== 'object' || v === null) return flat
  const inner = pad + '  '
  if (Array.isArray(v)) return `[\n${v.map((x) => inner + fmt(x, inner)).join(',\n')}\n${pad}]`
  return `{\n${Object.entries(v).map(([k, x]) => `${inner}${JSON.stringify(k)}: ${fmt(x, inner, k.length + 4)}`).join(',\n')}\n${pad}}`
}

function oneLine(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(oneLine).join(', ')}]`
  if (typeof v === 'object' && v !== null) return `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${oneLine(x)}`).join(', ')} }`
  return JSON.stringify(v)
}

export interface Read {
  /** The description, when it is JSON at all. */
  doc?: unknown
  /** What is wrong with it: the JSON reader's complaint, or the checker's list. Empty means sound. */
  errors: string[]
  /** The compiled scene, when it is sound. */
  scene?: CompiledScene
}

/** Reads what the visitor typed: JSON first, then the engine's checker, then the compiler. */
export function readDoc(text: string): Read {
  let doc: unknown
  try { doc = JSON.parse(text) } catch (e) { return { errors: [`JSON: ${(e as Error).message}`] } }
  const errors = checkScene(doc)
  if (errors.length) return { doc, errors }
  try {
    return { doc, errors, scene: compileScene(doc as SceneDoc) }
  } catch (e) {
    return { doc, errors: [`scene: ${(e as Error).message}`] }
  }
}

/** The fields that change the blobs: a change anywhere else (moves, lights, the view) needs no new cut. */
export function shapeKey(doc: SceneDoc): string {
  const { parts, bones, light, disc, cover, focus, air } = doc
  return JSON.stringify({ parts, bones, light, disc, cover, focus, air })
}

/** Whether any move names the tree's bone, and moves it some. */
export function swaying(doc: SceneDoc): boolean {
  return !!doc.moves?.some((m) => m.bone === 'tree' && !(m.kind === 'sway' && m.degrees === 0))
}

/** Whether a light near the lantern flickers. */
export function lanternFlickers(doc: SceneDoc): boolean {
  return !!doc.lights?.some((l) => !!l.flicker && l.flicker.by > 0 && Math.hypot(l.at[0] - LANTERN[0], l.at[1] - LANTERN[1], l.at[2] - LANTERN[2]) <= NEAR_LANTERN)
}

/** Whether the checker turned a move or a light down because it wouldn't come round whole in the loop. */
export function brokeTheLoop(errors: string[]): boolean {
  return errors.some((e) => e.includes('so the scene loops'))
}

/** The code that plays this description with the package. */
export function sceneCode(doc: SceneDoc): string {
  return `import { Stage, compileScene, checkScene, buildVoxels, type SceneDoc } from '@blobscape/engine'

// the whole scene is data: it could as well come from a .json file
const doc: SceneDoc = ${docText(doc)}

// the checker says what is wrong, each as 'where: what'
const problems = checkScene(doc)
if (problems.length) throw new Error(problems.join('\\n'))

// compiling gives the shapes for the builder, the poser, the lights and the pixel look
const scene = compileScene(doc)
const stage = await Stage.start(document.querySelector('canvas')!, { lights: true })
stage.setActor(buildVoxels(scene.spec(${SCENE_SPACING})))
stage.orbit = scene.orbit
// a pose and the lights, from the time: everything comes round in scene.loop seconds
stage.setPoser((sk, t) => {
  scene.pose(sk, t)
  stage.setLights(scene.lights(t))
})
`
}
