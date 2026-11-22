import type { Vec3 } from '../splat-core/blobs.ts'
import { hash } from './built.ts'
import type { BoneDoc, MoveDoc, PartDoc, SceneDoc } from './sceneDoc.ts'
import { STARS_GO } from './heavens.ts'

/**
 * Sky effects (Matt, 2026-11-22: the lantern grove's aurora as a scene effect of its own, which lives in the sky behind
 * a scene rather than falling on it as weather does; a meteor shower is the second): recipes any scene takes the same
 * way, laid behind it and never cut into it. Pure and tested.
 *
 * An effect is a small description of its own (`skyEffectDoc`), placed by the scene's starting view so it fills the sky
 * behind whatever scene it is laid over, and shown only at night under a clear enough sky (`effectOut`), going out with
 * the stars as clouds come over.
 */

export type SkyEffectId = 'aurora' | 'meteors'

export interface SkyEffect {
  id: SkyEffectId
  label: string
  /** A line for the page. */
  about: string
}

export const SKY_EFFECTS: readonly SkyEffect[] = [
  { id: 'aurora', label: 'Aurora', about: 'Curtains of green light, fringed with violet, swaying slowly over the scene.' },
  { id: 'meteors', label: 'Meteor shower', about: 'Shooting stars streak down the sky behind the scene, a few every loop.' },
]

export const skyEffectAsked = (q: string | null | undefined): SkyEffectId | undefined => SKY_EFFECTS.find((e) => e.id === q)?.id

type View = SceneDoc['camera']

/** Curtains of the aurora, pieces along each and rows up it, and meteors a loop. */
export const AURORA_CURTAINS = 3, AURORA_RAYS = 20, AURORA_ROWS = 5, METEORS = 12
/** How long a meteor takes to cross, in seconds, whatever the loop. */
export const METEOR_SECONDS = 0.7

export const AURORA_COLORS = ['#38d8a0', '#2cb890', '#a0f8d0', '#8c5cd8', '#c48cf0'] as const
export const METEOR_COLORS = ['#fff4d8', '#ffe8a8', '#a8d8ff'] as const

/** The colors an effect is painted in, which a pixel palette must hold for it. */
export const effectColors = (id: SkyEffectId): readonly string[] => (id === 'aurora' ? AURORA_COLORS : METEOR_COLORS)

/** The grid an effect is cut on: a share of the view's distance, so it is the same count of blobs for a near or far view. */
export const effectSpacing = (camera: View) => round(camera.distance * 0.0045)

/**
 * Where a point stands for the view: `across` the picture (to the right), `up` from the view's target and `away` behind
 * it, each in view distances.
 */
function placed(camera: View, across: number, up: number, away: number): Vec3 {
  const [x, y, z] = camera.target, d = camera.distance, a = (camera.azimuth * Math.PI) / 180
  // across the view is (cos a, -sin a), away from the eye (-sin a, -cos a)
  return [round(x + (across * Math.cos(a) - away * Math.sin(a)) * d), round(y + up * d), round(z + (-across * Math.sin(a) - away * Math.cos(a)) * d)]
}

/** The description of a sky effect for a scene seen from `camera`, `loop` seconds long. */
export function skyEffectDoc(id: SkyEffectId, camera: View, loop: number): SceneDoc {
  const view = { target: camera.target, distance: camera.distance, azimuth: camera.azimuth, elevation: camera.elevation }
  const base = { loop, camera: view, light: { from: [0.3, 1, 0.2] as Vec3, ambient: 1 }, big: true }
  return id === 'aurora' ? { ...base, name: 'Aurora', palette: [...AURORA_COLORS], ...aurora(camera) } : { ...base, name: 'Meteor shower', palette: [...METEOR_COLORS], ...meteors(camera, loop) }
}

/**
 * The aurora: curtains one behind the next, each a ribbon along a slow wave across the sky, bright along its foot, green
 * up its height and violet at the top, each swaying and drifting out of step with the others.
 */
function aurora(camera: View): { bones: BoneDoc[]; parts: PartDoc[]; moves: MoveDoc[] } {
  const d = camera.distance
  const bones: BoneDoc[] = [], parts: PartDoc[] = [], moves: MoveDoc[] = []
  for (let c = 0; c < AURORA_CURTAINS; c++) {
    const bone = `aurora${c}`, away = 0.26 + 0.06 * c, up = 0.25 + 0.03 * hash(c + 1, 31, 1)
    bones.push({ name: bone, at: placed(camera, 0, up, away) })
    // a curtain is a ribbon: rows of tubes along one slow wave, stacked close enough to run together, its height
    // changing along it, its bottom edge brightest and its top turning violet
    const rows: PartDoc['shape'][][] = Array.from({ length: AURORA_ROWS }, () => [])
    const at = (s: number, row: number): Vec3 => {
      const wave = Math.sin((s * 1.6 + c * 0.37) * Math.PI * 2)
      const tall = (0.022 + 0.026 * (0.5 + 0.5 * Math.sin((s * 3.1 + c * 0.8) * Math.PI * 2))) * (1 - 0.6 * Math.abs(s - 0.5))
      const fold = away + 0.035 * Math.cos((s * 1.3 + c * 0.5) * Math.PI * 2)
      return placed(camera, (s - 0.5) * (0.85 + 0.12 * c), up + 0.02 * wave + (tall * row) / (AURORA_ROWS - 1), fold)
    }
    const r = round(0.006 * d)
    for (let k = 0; k < AURORA_RAYS; k++) {
      const s0 = k / AURORA_RAYS, s1 = (k + 1) / AURORA_RAYS
      for (let row = 0; row < AURORA_ROWS; row++) rows[row].push({ kind: 'cone', from: at(s0, row), to: at(s1, row), r: round(r * (1 - (0.4 * row) / AURORA_ROWS)) })
    }
    // three parts, so lines drawn between parts stay at its foot and under its fringe
    const body: PartDoc['shape'][] = rows.slice(1, -1).map((shapes) => ({ kind: 'join', shapes }))
    for (const [shapes, paint] of [[rows[0], AURORA_COLORS[2]], [body, AURORA_COLORS[c % 2]], [rows[AURORA_ROWS - 1], AURORA_COLORS[3 + (c % 2)]]] as const) {
      parts.push({ shape: { kind: 'join', shapes: [...shapes] }, paint, bone, glow: true, noShadow: true, bare: true })
    }
    const phase = round(c / AURORA_CURTAINS)
    moves.push({ kind: 'sway', bone, axis: 'z', degrees: 2.5, times: 1, phase })
    moves.push({ kind: 'bob', bone, by: [round(0.02 * d), round(0.008 * d), 0], times: 2, phase })
    // it brightens and dims as the curtains ripple
    moves.push({ kind: 'pulse', bone, size: [0.92, 1.05], times: 3, phase })
  }
  return { bones, parts, moves }
}

/**
 * The meteor shower: each a short streak with a bright head that is born high in the sky, runs down and across it in
 * `METEOR_SECONDS` and is gone, at its own moment in the loop, all falling the same way as from one radiant.
 */
function meteors(camera: View, loop: number): { bones: BoneDoc[]; parts: PartDoc[]; moves: MoveDoc[] } {
  const d = camera.distance, r = round(0.004 * d), span = Math.min(0.5, METEOR_SECONDS / loop)
  const bones: BoneDoc[] = [], parts: PartDoc[] = [], moves: MoveDoc[] = []
  // the way they fall, in view distances: across and down, as from a radiant up and to the left
  const run: [number, number] = [0.25, -0.1]
  for (let i = 0; i < METEORS; i++) {
    const bone = `meteor${i}`
    const across = -0.6 + 0.9 * hash(i + 1, 41, 1), up = 0.2 + 0.12 * hash(i + 1, 41, 2), away = 0.5 + 0.2 * hash(i + 1, 41, 3)
    const head = placed(camera, across, up, away), tail = placed(camera, across - run[0] * 0.5, up - run[1] * 0.5, away)
    bones.push({ name: bone, at: head })
    parts.push({ shape: { kind: 'cone', from: tail, to: head, r: round(r * 0.3), rTo: r }, paint: METEOR_COLORS[i % 3 === 2 ? 2 : 1], bone, glow: true, noShadow: true, bare: true })
    parts.push({ shape: { kind: 'sphere', at: head, r: round(r * 1.6) }, paint: METEOR_COLORS[0], bone, glow: true, noShadow: true, bare: true })
    const to = placed(camera, across + run[0], up + run[1], away)
    // spread through the loop, seldom two at once
    const start = round(((i + 0.25 + 0.25 * hash(i + 1, 41, 4)) / METEORS) % 1)
    moves.push({ kind: 'drift', bone, by: [round(to[0] - head[0]), round(to[1] - head[1]), round(to[2] - head[2])], times: 1, grow: [1, 0.4], during: [start, round((start + span) % 1)] })
  }
  return { bones, parts, moves }
}

/**
 * How much of a sky effect is out, 0 to 1: none by day, all of it at night under a clear sky, going out with the stars
 * as `cover` of the sky turns to cloud. `night` is how much a night the sky is (`nightOf`).
 */
export function effectOut(night: number, cover: number): number {
  const clear = 1 - Math.min(1, Math.max(0, (cover - STARS_GO[0]) / (STARS_GO[1] - STARS_GO[0])))
  const dark = Math.min(1, Math.max(0, (night - 0.4) / 0.4))
  return dark * clear
}

/** The light an aurora throws onto the scene under it, at its middle curtain's foot (linear color at full strength). */
export function auroraLight(camera: View, out: number): { position: Vec3; color: Vec3; range: number } | undefined {
  if (out <= 0 || camera.distance <= 0) return undefined
  return { position: placed(camera, 0, 0.25, 0.12), color: [0.05 * out, 0.5 * out, 0.3 * out], range: round(camera.distance * 0.4) }
}

const round = (v: number) => Math.round(v * 1e4) / 1e4
