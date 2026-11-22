import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { Chip, Field, Slider, Toggle } from '../shared/ui.tsx'
import type { Palette } from './diorama/scene.ts'
import { STYLES, isPixelStyle, type Style } from './diorama/styles.ts'
import { GlitchControls } from './diorama/GlitchControls.tsx'
import type { GlitchChoice } from './glitchLooks.ts'
import { PIXEL_RATES, PIXEL_SIZES, TEXEL_BANDS, type Finish, type PixelSettings } from './styleSettings.ts'

/**
 * The Style and Finish controls Diorama and Scene Creator share (`styleSettings.ts` holds what they set), so a setting
 * added for a style is on both pages. Each renders a run of sections for the page's own tab or panel.
 */

const OUTLINES = [['none', 'None'], ['one', 'One color'], ['own', 'Each thing’s own']] as const

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

/** Drawn as, the look's own controls, then pixel art's palette, pixel size and motion. */
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
      {pixels && <Field label="Palette">
        <div className="flex flex-wrap gap-1.5" data-testid={`${prefix}-palettes`}>
          {palettes.map((p) => <Chip key={p.id} active={picked.id === p.id} onClick={() => setPixel({ palette: p.id })}>{p.label}</Chip>)}
        </div>
        <div data-testid="palette-strip" aria-hidden className="mt-5 flex h-3 overflow-hidden rounded ring-1 ring-rule">
          {colors.length ? colors.map((c, i) => <span key={i} className="flex-1" style={{ background: `rgb(${c[0]} ${c[1]} ${c[2]})` }} />) : <span className="flex-1 bg-paper-sunk" />}
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          {!colors.length ? 'No palette: every pixel keeps the color the scene gives it, in as many colors as it takes.'
            : picked.id === 'own' ? `${ownNote(colors.length)} Every pixel snaps to the closest one.`
              : `${picked.note ?? `A borrowed palette of ${colors.length} colors.`} Every pixel snaps to the closest one.`}
        </p>
      </Field>}
      {pixels && <Field label="Pixel size">
        <div className="flex flex-wrap gap-1.5">
          {PIXEL_SIZES.map((n) => <Chip key={n} active={pixel.size === n} onClick={() => setPixel({ size: n })}>{n}×</Chip>)}
        </div>
      </Field>}
      {pixels && <Field label="Motion">
        <div className="flex flex-wrap gap-1.5">
          {PIXEL_RATES.map((n) => <Chip key={n} active={pixel.rate === n} onClick={() => setPixel({ rate: n })}>{n ? `${n} a second` : 'Smooth'}</Chip>)}
        </div>
      </Field>}
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

/** Dither, glow, what cuts the scene again (steps, bands, shading), outlines, lines, sky and the art-pixel effects. */
export function FinishControls({ style, pixel, setPixel, finish, colors, calm, glow = true, rocks = true, skyForced }: FinishProps) {
  const pixels = isPixelStyle(style)
  return (
    <>
      {pixels && <Slider label="Dither" value={pixel.dither} min={0} max={1} step={0.05} onChange={(v) => setPixel({ dither: v })} format={(v) => `${Math.round(v * 100)}%`} hint={colors ? 'Checkers two palette colors to fake the ones between, where a pixel artist would: in the sky and the light round glowing things. Surfaces stay flat.' : 'Needs a palette: Full color has none to mix.'} />}
      {/* neon and stained glass put the scene's lights by (neon has a Glow of its own in the Style tab), so this one would do nothing there */}
      {glow && style !== 'neon' && style !== 'glass' && <Slider label="Glow" value={pixel.glow} min={0} max={4} step={0.25} onChange={(v) => setPixel({ glow: v })} format={(v) => (v ? `${v.toFixed(2)}×` : 'off')} hint={pixels ? 'How strongly lamps, fires and other glowing things light what is round them, and how far bright pixels shine into the ones beside them.' : 'How strongly lamps, fires and other glowing things light what is round them.'} />}
      <div className="grid gap-3">
        {!pixels && <p className="text-xs text-ink-faint">Dither, outlines and the sky belong to the Pixel art style. Pick it in the Style tab to change them.</p>}
        {pixels && <>
          <Toggle label="Paint in steps of the palette" checked={pixel.steps} onChange={(v) => setPixel({ steps: v })} disabled={!colors} />
          <p className="text-xs text-ink-faint">{colors ? 'Cuts the scene again with every blob in one palette color, a step of its own paint from shade to sun, so shade falls in flat bands.' : 'Needs a palette: Full color has no steps.'}</p>
          <Toggle label="Light in bands" checked={pixel.texel > 1} onChange={(on) => setPixel({ texel: on ? TEXEL_BANDS : 0 })} />
          <p className="text-xs text-ink-faint">Lights each blob as one block in a few flat steps of sun and shade, so light falls in crisp bands along the surface and each thing keeps its own paint. Cuts the scene again.</p>
          <Toggle label="Shade each pixel" checked={pixel.shade} onChange={(v) => setPixel({ shade: v })} />
          <p className="text-xs text-ink-faint">Works the light out a pixel at a time from the scene's sun and lamps, so light and shade fall in bands that follow each shape. Cuts the scene again.</p>
          <Field label="Outline">
            <div className="flex flex-wrap gap-1.5">
              {OUTLINES.map(([id, name]) => <Chip key={id} active={(!pixel.outline ? 'none' : pixel.own ? 'own' : 'one') === id} onClick={() => setPixel(id === 'none' ? { outline: false } : { outline: true, own: id === 'own' })}>{name}</Chip>)}
            </div>
          </Field>
          <Toggle label="Lines inside the scene" checked={pixel.lines} onChange={(v) => setPixel({ lines: v })} />
          <Toggle label="Sky behind" checked={pixel.sky || !!skyForced} disabled={!!skyForced} onChange={(v) => setPixel({ sky: v })} />
          {skyForced && <p className="text-xs text-ink-faint">{skyForced}</p>}
          <Toggle label="Heat haze over glowing things" checked={pixel.heat > 0} onChange={(on) => setPixel({ heat: on ? finish.heat || 1 : 0 })} />
          {finish.cycle && <Toggle label="Color cycling" checked={pixel.cycle} onChange={(v) => setPixel({ cycle: v })} />}
          <p className="text-xs text-ink-faint">Every pixel is settled from four samples, holds its color while the light wavers, and lies in flat patches with clean outlines, with dither kept for the sky and glows: after Silicon Jungle's Ink Studio, as are the glow's rings, the haze{finish.cycle ? ', the cycling' : ''} and the softer outline on lit sides.</p>
        </>}
        {rocks && <Toggle label="Rock the view" checked={pixel.rock} onChange={(v) => setPixel({ rock: v })} disabled={calm} />}
      </div>
    </>
  )
}
