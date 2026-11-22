import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { Chip, Field } from '../shared/ui.tsx'
import type { Palette } from './diorama/scene.ts'
import { STYLES, isPixelStyle, type Style } from './diorama/styles.ts'
import { GlitchControls } from './diorama/GlitchControls.tsx'
import type { GlitchChoice } from './glitchLooks.ts'
import type { Finish, PixelSettings } from './styleSettings.ts'
import { PIXEL } from './styles/catalog.ts'
import { SettingsControls } from './styles/SettingsControls.tsx'

/**
 * The Style and Finish controls Diorama and Scene Creator share (`styleSettings.ts` holds what they set), so a setting
 * added for a style is on both pages. Each renders a run of sections for the page's own tab or panel.
 */

interface StyleProps {
  style: Style
  onStyle: (id: Style) => void
  pixel: PixelSettings
  setPixel: (change: Partial<PixelSettings>) => void
  glitch: GlitchChoice
  setGlitch: Dispatch<SetStateAction<GlitchChoice>>
  /** The palettes pixel art can snap to, the scene's own first. */
  palettes: Palette[]
  /** What the scene's own palette is, for the line under it: "The 24 colors chosen for this scene." */
  ownNote: (count: number) => string
  /** The controls of the look picked, when it is not pixel art (`useDrawnLook`). */
  drawn: ReactNode
  /** A line more under the styles (the page's own: the scene is cut again, and so on). */
  more?: string
  calm: boolean
  /** Test ids start with this: `<prefix>-styles`, `<prefix>-palettes`. */
  prefix: string
}

/** Drawn as, the look's own controls, then pixel art's palette, pixel size and motion, drawn from the catalog. */
export function StyleControls({ style, onStyle, pixel, setPixel, glitch, setGlitch, palettes, ownNote, drawn, more, calm, prefix }: StyleProps) {
  const pixels = isPixelStyle(style)
  const picked = palettes.find((p) => p.id === pixel.palette) ?? palettes[0]
  const colors = picked.colors
  return (
    <>
      <Field label="Drawn as">
        <div className="flex flex-wrap gap-1.5" data-testid={`${prefix}-styles`}>
          {STYLES.map((l) => <Chip key={l.id} active={style === l.id} onClick={() => onStyle(l.id)}>{l.label}</Chip>)}
        </div>
        <p className="mt-1.5 text-xs text-ink-faint">{STYLES.find((l) => l.id === style)?.note}{more ? ` ${more}` : ''}</p>
      </Field>
      {drawn}
      {style === 'glitch' && <GlitchControls glitch={glitch} setGlitch={setGlitch} calm={calm} />}
      {pixels && <SettingsControls def={PIXEL} value={pixel} onChange={setPixel} on={{ style }} tab="style" choices={{ palette: {
        options: palettes, active: picked.id, testid: `${prefix}-palettes`,
        under: <>
          <div data-testid="palette-strip" aria-hidden className="mt-5 flex h-3 overflow-hidden rounded ring-1 ring-rule">
            {colors.length ? colors.map((c, i) => <span key={i} className="flex-1" style={{ background: `rgb(${c[0]} ${c[1]} ${c[2]})` }} />) : <span className="flex-1 bg-paper-sunk" />}
          </div>
          <p className="mt-2 text-xs text-ink-faint">
            {!colors.length ? 'No palette: every pixel keeps the color the scene gives it, in as many colors as it takes.'
              : picked.id === 'own' ? `${ownNote(colors.length)} Every pixel snaps to the closest one.`
                : `${picked.note ?? `A borrowed palette of ${colors.length} colors.`} Every pixel snaps to the closest one.`}
          </p>
        </>,
      } }} />}
    </>
  )
}

interface FinishProps {
  style: Style
  pixel: PixelSettings
  setPixel: (change: Partial<PixelSettings>) => void
  /** The scene's own finish (whether it has lines where colors jump, heat, color cycling). */
  finish: Finish
  /** How many colors the palette picked has: dither and steps need some. */
  colors: number
  calm: boolean
  /** Whether Glow is here (Scene Creator keeps it with the light). */
  glow?: boolean
  /** Whether the scene rocks, so Rock the view does something. */
  rocks?: boolean
  /** Whether the sky is behind whatever the switch says, and why. */
  skyForced?: string
}

/** Dither, glow, what cuts the scene again (steps, bands, shading), outlines, lines, sky and the art-pixel effects, drawn from the catalog. */
export function FinishControls({ style, pixel, setPixel, finish, colors, calm, glow = true, rocks = true, skyForced }: FinishProps) {
  const pixels = isPixelStyle(style)
  const on = { style, colors, cycle: !!finish.cycle, heat: finish.heat }
  const skip: (keyof PixelSettings)[] = [...(glow ? [] : ['glow' as const]), ...(rocks ? [] : ['rock' as const])]
  const locked = { ...(skyForced ? { sky: { value: true, why: skyForced } } : {}), ...(calm ? { rock: {} } : {}) }
  return (
    <>
      <SettingsControls def={PIXEL} value={pixel} onChange={setPixel} on={on} tab="finish" skip={skip} />
      <div className="grid gap-3">
        {!pixels && <p className="text-xs text-ink-faint">Dither, outlines and the sky belong to the Pixel art style. Pick it in the Style tab to change them.</p>}
        <SettingsControls def={PIXEL} value={pixel} onChange={setPixel} on={on} tab="switches" skip={skip} locked={locked} />
        {pixels && <p className="text-xs text-ink-faint">Every pixel is settled from four samples, holds its color while the light wavers, and lies in flat patches with clean outlines, with dither kept for the sky and glows: after Silicon Jungle's Ink Studio, as are the glow's rings, the haze{finish.cycle ? ', the cycling' : ''} and the softer outline on lit sides.</p>}
      </div>
    </>
  )
}
