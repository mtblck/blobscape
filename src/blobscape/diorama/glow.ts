import type { PointLight } from '../../splat-engine/engine.ts'

/** How much further a light reaches for each doubling of its strength: the fourth root, so four times the glow reaches about 40% further. */
export const REACH_POWER = 0.25

/**
 * How many times its own strength a scene's lights shine for the page's Glow setting: 1 at the scene's own glow
 * (`finish.glow`), so a scene opens as its description lights it, none at 0, and in step with the setting between
 * and beyond.
 */
export function glowGain(glow: number, own: number): number {
  return own > 0 ? Math.max(0, glow) / own : glow > 0 ? 1 : 0
}

/**
 * A scene's live lights as the Glow setting has them: `gain` times as strong, reaching a little further as they
 * grow (`REACH_POWER`), since a brighter lamp is seen on things further off. Their baked shadows are worked out to
 * twice a light's own range, so the reach grows slowly and stays near what was looked at.
 */
export function castBy(lights: PointLight[], gain: number): PointLight[] {
  if (gain === 1) return lights
  const reach = Math.max(gain, 1e-3) ** REACH_POWER
  return lights.map((l) => ({ ...l, color: [l.color[0] * gain, l.color[1] * gain, l.color[2] * gain], range: l.range * reach }))
}
