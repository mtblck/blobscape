import { useCallback, useEffect, useRef } from 'react'
import type { GlitchLook } from '../splat-core/glitch.ts'
import type { PixelLook, Rgb } from '../splat-core/pixel.ts'
import type { CreatureStage } from './creature/stage.ts'

/**
 * A style put on a stage: the one place a page hands the stage what `styleSettings.ts` worked out (Matt, 2026-11-22:
 * a style is drawn the same wherever it is used, from one definition). Diorama and Scene Creator both call it and
 * neither sets these on its stage itself, so a change to how a style is drawn is made here, or in styleSettings.ts
 * (the settings and the pixel look) or drawnLook.tsx (the other looks), and reaches every page.
 *
 * Four Ways and the pixel lesson pass looks of their own on purpose (one finish three other renderers can match; a
 * lesson that switches the look's parts on one at a time) and leave the sort and sharpness alone.
 *
 * A page that tries something of its own passes different values in (its own look, size or pace); what works is
 * folded in by moving it into those shared files, never by a second copy of this wiring.
 */
export interface StyleOnStage {
  /** Whether the scene is drawn as pixel art now (pixel art and the glitch), and the look and pixel size it is drawn with. */
  pixels: boolean
  look: PixelLook
  /** Device pixels to an art pixel, as `pixelSizeAt` gives it. */
  size: number
  /** Frames a second the scene moves at as pixel art; 0 is every frame. */
  rate?: number
  /** The exact (radix) sort; left out, the stage's sort is left as it is. */
  exact?: boolean
  /** The glitch's bursts, while that style is on. */
  glitch?: GlitchLook
  /** A phone or tablet: the styles that fill the whole screen are drawn a little less sharply there. Left out, the stage's sharpness is left as it is. */
  coarse?: boolean
}

/**
 * Sets the stage for the style. Returns `skyOf(top, low)`, which hands pixel art the sky of the moment for a scene
 * whose sky changes as it plays (a turning day, weather easing in); it sets the look again only when the sky changed.
 */
export function useStyleOnStage(stage: CreatureStage | null | undefined, { pixels, look, size, rate = 0, exact, glitch, coarse }: StyleOnStage): (top: Rgb, low: Rgb) => void {
  const drawn = pixels ? look : undefined
  const last = useRef('')
  // the exact sort: the stage rebuilds its world, keeping the moment and the poser
  useEffect(() => { if (exact !== undefined) stage?.setSort(exact ? 'radix' : 'bins') }, [stage, exact])
  // on a phone the styles that fill the whole screen (pixel art fills a small frame) are drawn at one and a half device
  // pixels to a CSS pixel, not two: every pass has near half the pixels to fill, and the marks are no finer than that
  useEffect(() => { if (coarse !== undefined) stage?.setSharpness(coarse && !pixels ? 1.5 : 2) }, [stage, coarse, pixels])
  useEffect(() => {
    last.current = ''
    stage?.setPixels(drawn, size)
  }, [stage, drawn, size])
  // pixel art can move in held steps; the other styles move every frame
  useEffect(() => { if (stage) { stage.step = pixels && rate ? 1 / rate : 0; stage.invalidate() } }, [stage, pixels, rate])
  useEffect(() => { stage?.setGlitch(glitch) }, [stage, glitch])
  return useCallback((top: Rgb, low: Rgb) => {
    if (!stage || !drawn?.sky) return
    const key = `${top}|${low}`
    if (key === last.current) return
    last.current = key
    stage.setPixels({ ...drawn, sky: [top, low, drawn.sky[2]] as NonNullable<PixelLook['sky']> }, size)
  }, [stage, drawn, size])
}
