import type { GlyphSet } from '../../splat-core/glyphs.ts'
import type { Style } from './styles.ts'
import { SCENE_DETAIL } from './detail.ts'
import { TIMES, type TimeId } from '../timeOfDay.ts'
import { TRANSITIONS, type TransitionKind } from '../../splat-core/transition.ts'
import { CLOUD_COVERS, WEATHERS, WINDS, type CloudId, type WeatherId, type WindId } from '../skyRecipes.ts'
import { BLOCK_GROUNDS, BLOCK_SIZES, BLOCK_START, SWELL_MOST, type BlockChoice } from './blockLooks.ts'
import { PAPERS } from './brushLooks.ts'
import { BACKDROPS, CEL_START } from './celLooks.ts'
import { GLASS_START, type GlassChoice } from './glassLooks.ts'
import { GLITCH_AMOUNTS, GLITCH_PACE_CHOICES, GLITCH_START, type GlitchChoice } from './glitchLooks.ts'
import { NEON_PACES, NEON_SETS, NEON_START, type NeonChoice } from './neonLooks.ts'
import { WASH_PAPERS, WASH_START, type WashChoice } from './washLooks.ts'
import { KNIT_PATTERNS, KNIT_START, KNIT_SWEATERS, type KnitChoice } from './knitLooks.ts'

/**
 * The styles API (Matt, 2026-11-22: no page uses a version of a style all its own). Two things, both data:
 *
 * - the catalog (`CATALOG`): every style's settings written once, each with its kind, its choices or range, where it
 *   starts and its name in the address. Controls are drawn from it (`SettingsControls.tsx`), the address is read by it
 *   (`fromAddress`) and kept settings are checked against it (`settingsFrom`), so a setting added here is on every
 *   page that offers the style, in its links and in its saved scenes.
 * - the value (`StyleValue`): which style, and each style's settings, which a page holds, a saved scene keeps and a
 *   link carries.
 *
 * An experiment tries a setting of its own by adding it to the style here marked `trial` with the experiment's name:
 * only that page shows it. Folding it in is taking the mark off. Pure, so it is tested.
 */

/** How a number reads beside its slider. */
export type Unit = 'percent' | 'px' | 'deg' | 'times' | 'count'

/** What a setting's `when` is told about the page: the style on show and what the subject has. */
export interface Shows {
  /** The style on show. */
  style: Style
  /** Whether the subject has water. */
  water?: boolean
  /** Whether weather is out over the subject. */
  weather?: boolean
  /** Whether the scene has a color cycle. */
  cycle?: boolean
  /** How many colors the palette on show has (0 is full color). */
  colors?: number
  /** The scene's own heat haze, in art pixels. */
  heat?: number
}

/** Where on a page a setting is laid: a style whose settings are spread over two tabs says which (pixel art's Style and Finish; `switches` is the Finish tab's run of switches). */
export type Tab = 'style' | 'finish' | 'switches'

interface Base<V> {
  key: keyof V & string
  label: string
  /** A line under the control. */
  hint?: string | ((on: Shows) => string)
  /** Which tab it is laid in, where a style has more than one; with none it is in the address and kept settings only. */
  tab?: Tab
  /** Why it can't be set just now (no palette to step through), shown in its hint's place with the control held. */
  held?: (on: Shows) => string | undefined
  /** Drawn as another kind of control than it is kept as: a number as a switch, two switches as one choice. */
  draw?: Drawn<V>
  /** Its name in the address (`?block=3`). */
  address?: string
  /** Whether it is shown, by the style's own settings and the page; a hidden setting keeps its value. */
  when?: (v: V, on: Shows) => boolean
  testid?: string
  /** An experiment's own try: the name of the one page that shows it, until it is folded in by taking this off. */
  trial?: string
}
/** How a setting is drawn when not as its own kind: what the control shows for the settings as they are, and what a press changes. */
export type Drawn<V> =
  | { kind: 'toggle'; at: (v: V) => boolean; set: (to: boolean, on: Shows) => Partial<V> }
  | { kind: 'choice'; options: readonly { id: string; label: string }[]; at: (v: V) => string; set: (id: string) => Partial<V> }
/** A slider. */
export interface RangeSetting<V> extends Base<V> {
  /** What says it is a slider. */
  kind: 'range'
  /** The least it goes to. */
  min: number
  /** The most it goes to. */
  max: number
  /** How far one step of the slider moves it. */
  step: number
  /** How its number reads beside the slider. */
  unit: Unit
  /** What 0 reads as ("None"). */
  zero?: string
  /** Held to whole steps. */
  whole?: boolean
}
/** One of a few, as chips. `open` choices are the page's to list (a scene's palettes): any id is kept. */
export interface ChoiceSetting<V> extends Base<V> {
  /** What says it is a choice. */
  kind: 'choice'
  /** What can be picked: each one's kept value, its name, and a line about it. */
  options: readonly { id: string | number; label: string; about?: string }[]
  /** The page lists the choices itself (a scene's palettes), so any id is kept. */
  open?: boolean
}
/** A switch. One that starts `null` follows its style (`auto`) until the visitor says. `on` is the address's word for it when not 1. */
export interface ToggleSetting<V> extends Base<V> {
  /** What says it is a switch. */
  kind: 'toggle'
  /** A line beside the switch. */
  about?: string | ((style: Style, on: Shows) => string)
  /** What a switch that starts `null` does for a style until the visitor says. */
  auto?: (style: Style) => boolean
  /** The address's word for on, when it is not 1. */
  on?: string
}
/** A whole number a button moves on, for another run of something random. */
export interface SeedSetting<V> extends Base<V> {
  /** What says it is a seed. */
  kind: 'seed'
}
/** A line of text the visitor types (the words a picture is written in). */
export interface TextSetting<V> extends Base<V> {
  /** What says it is text. */
  kind: 'text'
  /** The most characters it keeps. */
  most: number
}
/** A setting of a style: a slider, a choice, a switch, a seed or a line of text. */
export type StyleSetting<V> = RangeSetting<V> | ChoiceSetting<V> | ToggleSetting<V> | SeedSetting<V> | TextSetting<V>

/** One style's settings (or those of a few styles that share them, as the brush marks do). */
export interface StyleDef<V> {
  /** The name its settings are kept under. */
  id: string
  /** The styles that use these settings. */
  styles: readonly Style[]
  /** Where every setting starts. */
  start: V
  /** The settings, in the order a page lays them out. */
  settings: readonly StyleSetting<V>[]
}

// ---- the settings of each style ----

/** The brush marks (gouache, oil, ink and wash, hatching, stipple) and the plain blobs, which can take the pen's outline too. */
export interface MarkSettings {
  /** How big a mark is beside its blob. */
  size: number
  /** Whether a pen outlines things; null is on for the pen looks and off for paint. */
  outline: boolean | null
  /** The pen's width, in CSS pixels. */
  pen: number
  /** The paper and ink, an id of `PAPERS`. */
  paper: string
  /** The palette the scene is painted from before it is drawn: 'none' keeps its own colors, 'own' is the scene's, else a shared one. */
  palette: string
}
/** The settings of the picture drawn as characters. */
export interface AsciiSettings {
  /** Which characters: ASCII, braille, words or a typewriter's (Box Art's sets are its own style). */
  chars: GlyphSet
  /** The text the picture is written in, drawn as words. */
  words: string
  /** A character's height, in CSS pixels. */
  letter: number
  /** How heavy the characters are drawn. */
  weight: number
  /** Whether edges are drawn as strokes (| _ / \\). */
  strokes: boolean
  /** Whether fur and grass are drawn as strokes along the way they lie. */
  strands: boolean
  /** Whether each character takes the color of what it shows. */
  own: boolean
  /** The ground and ink, an id of `PAPERS`. */
  paper: string
  /** The palette the scene is painted from before it is drawn: 'none' keeps its own colors, 'own' is the scene's, else a shared one. */
  palette: string
}
/** The settings of the picture drawn as Box Art: the box-drawing and block characters, apart from Text (Matt, 2026-11-25). */
export interface BoxArtSettings {
  /** Which characters: box drawing ('lines') or quarter blocks and shades ('blocks'). */
  chars: 'lines' | 'blocks'
  /** A character's height, in CSS pixels. */
  letter: number
  /** How heavy the characters are drawn. */
  weight: number
  /** Whether each character takes the color of what it shows. */
  own: boolean
  /** The ground and ink, an id of `PAPERS`. */
  paper: string
  /** The palette the scene is painted from before it is drawn: 'none' keeps its own colors, 'own' is the scene's, else a shared one. */
  palette: string
}
/** Cel shading's settings. */
export interface CelSettings {
  /** Where the light is, in degrees round the subject from the starting view. */
  turn: number
  /** How high the light stands, in degrees. */
  height: number
  /** How many tones the light is cut into. */
  tones: 2 | 3
  /** Whether things cast shadows. */
  shadows: boolean
  /** How far the light is smoothed over a surface before it is cut, in pixels. */
  smooth: number
  /** How many flat colors each part's own are gathered into; 0 leaves them as painted. */
  fills: number
  /** What stands behind, an id of `BACKDROPS`; '' is the subject's own sky where it has one. */
  backdrop: string
  /** Whether an even line is drawn round things. */
  outline: boolean
  /** The line's width, in CSS pixels. */
  pen: number
  /** The palette the scene is painted from before it is lit: 'none' keeps its own colors, 'own' is the scene's, else a shared one. */
  palette: string
}

/** Pixel art's settings, as the Style and Finish controls set them. */
export interface PixelSettings {
  /** The palette's id: 'own' is the scene's, else one of the shared ones. */
  palette: string
  /** Each art pixel this many device pixels across. */
  size: number
  /** Frames a second the scene moves at; 0 is every frame the screen shows. */
  rate: number
  /** How much dither, 0 to 1. */
  dither: number
  /** How strongly glowing things light what is round them and shine into the pixels beside them. */
  glow: number
  /** A line round the scene, and whether it takes a darker tone of each thing it goes round. */
  outline: boolean
  /** Whether the outline takes a darker tone of each thing it goes round. */
  own: boolean
  /** Lines inside the scene: where things meet (and, where the scene asks, where colors jump). */
  lines: boolean
  /** Whether the scene's sky is drawn behind it. */
  sky: boolean
  /** Heat haze over glowing things, in art pixels; 0 is none. */
  heat: number
  /** Glow in flat rings. */
  bands: number
  /** A softer outline on lit sides. */
  selout: boolean
  /** Color cycling, where the scene has one. */
  cycle: boolean
  /** Painted in steps of the palette as the scene is cut. */
  steps: boolean
  /** Light in this many bands a blob, as the scene is cut; 0 is smooth light. */
  texel: number
  /** Light worked out a pixel at a time (cel shading in the small picture), with the scene cut unlit. */
  shade: boolean
  /** The scene's own gentle rocking of the view. */
  rock: boolean
  /** The exact (radix) sort. */
  exact: boolean
}

/** The pixel sizes on offer. */
export const PIXEL_SIZES = [2, 3, 4, 6]
/** The paces on offer, in frames a second; 0 is smooth. */
export const PIXEL_RATES = [0, 12, 8]
/** How many steps of sun Light in bands gives (`banded`): three, none, half and full, kept the paint's texture best. */
export const TEXEL_BANDS = 3

const pixelArt = (_v: unknown, on: Shows) => on.style === 'pixel' || on.style === 'glitch'

const PEN_LOOKS: readonly Style[] = ['ink', 'hatch', 'stipple']
const turn = <V extends { turn: number }>(): RangeSetting<V> => ({ key: 'turn' as keyof V & string, kind: 'range', label: 'Light from', min: -180, max: 180, step: 5, unit: 'deg', hint: 'Round the subject, from where the view starts: 0° is from the front, 90° from the right. The shadows go with it.' })
const height = <V extends { height: number }>(): RangeSetting<V> => ({ key: 'height' as keyof V & string, kind: 'range', label: 'Light height', min: 10, max: 85, step: 1, unit: 'deg' })

/**
 * Pixel art. Where a scene has a finish of its own it starts these (`pixelStart` in styleSettings.ts); this start is
 * a scene with none. Its controls are spread over two tabs (`tab`), and a few are drawn as another kind than they are
 * kept as (`draw`): the outline's two switches are one choice of three, and the bands and the haze are switches.
 */
export const PIXEL: StyleDef<PixelSettings> = {
  id: 'pixel', styles: ['pixel', 'glitch'],
  start: { palette: 'own', size: 2, rate: 0, dither: 0.5, glow: 1, outline: true, own: true, lines: true, sky: true, heat: 0, bands: 2, selout: true, cycle: true, steps: false, texel: 0, shade: false, rock: true, exact: false },
  settings: [
    { key: 'palette', kind: 'choice', label: 'Palette', tab: 'style', options: [{ id: 'own', label: 'Scene’s own' }], open: true },
    { key: 'size', kind: 'choice', label: 'Pixel size', tab: 'style', address: 'px', options: PIXEL_SIZES.map((n) => ({ id: n, label: `${n}×` })) },
    { key: 'rate', kind: 'choice', label: 'Motion', tab: 'style', options: PIXEL_RATES.map((n) => ({ id: n, label: n ? `${n} a second` : 'Smooth' })) },
    { key: 'dither', kind: 'range', label: 'Dither', tab: 'finish', when: pixelArt, min: 0, max: 1, step: 0.05, unit: 'percent', hint: (on) => (on.colors ? 'Checkers two palette colors to fake the ones between, where a pixel artist would: in the sky and the light round glowing things. Surfaces stay flat.' : 'Needs a palette: Full color has none to mix.') },
    // neon, stained glass and knitting put the scene's lights by (neon has a Glow of its own), so this one would do nothing there
    { key: 'glow', kind: 'range', label: 'Glow', tab: 'finish', address: 'glow', when: (_v, on) => on.style !== 'neon' && on.style !== 'glass' && on.style !== 'knit', min: 0, max: 4, step: 0.25, unit: 'times', zero: 'off', hint: (on) => (pixelArt(0, on) ? 'How strongly lamps, fires and other glowing things light what is round them, and how far bright pixels shine into the ones beside them.' : 'How strongly lamps, fires and other glowing things light what is round them.') },
    { key: 'steps', kind: 'toggle', label: 'Paint in steps of the palette', tab: 'switches', address: 'steps', when: pixelArt, held: (on) => (on.colors ? undefined : 'Needs a palette: Full color has no steps.'), about: 'Cuts the scene again with every blob in one palette color, a step of its own paint from shade to sun, so shade falls in flat bands.' },
    { key: 'texel', kind: 'range', label: 'Light in bands', tab: 'switches', address: 'texel', when: pixelArt, min: 0, max: 8, step: 1, unit: 'count', whole: true, draw: { kind: 'toggle', at: (v) => v.texel > 1, set: (to) => ({ texel: to ? TEXEL_BANDS : 0 }) }, hint: 'Lights each blob as one block in a few flat steps of sun and shade, so light falls in crisp bands along the surface and each thing keeps its own paint. Cuts the scene again.' },
    { key: 'shade', kind: 'toggle', label: 'Shade each pixel', tab: 'switches', address: 'shade', when: pixelArt, about: 'Works the light out a pixel at a time from the scene\'s sun and lamps, so light and shade fall in bands that follow each shape. Cuts the scene again.' },
    { key: 'outline', kind: 'toggle', label: 'Outline', tab: 'switches', when: pixelArt, draw: { kind: 'choice', options: [{ id: 'none', label: 'None' }, { id: 'one', label: 'One color' }, { id: 'own', label: 'Each thing’s own' }], at: (v) => (!v.outline ? 'none' : v.own ? 'own' : 'one'), set: (id) => (id === 'none' ? { outline: false } : { outline: true, own: id === 'own' }) } },
    { key: 'own', kind: 'toggle', label: 'Outline in each thing’s own color', address: 'own' },
    { key: 'lines', kind: 'toggle', label: 'Lines inside the scene', tab: 'switches', address: 'parts', when: pixelArt },
    { key: 'sky', kind: 'toggle', label: 'Sky behind', tab: 'switches', when: pixelArt },
    { key: 'heat', kind: 'range', label: 'Heat haze over glowing things', tab: 'switches', address: 'heat', when: pixelArt, min: 0, max: 3, step: 1, unit: 'px', whole: true, draw: { kind: 'toggle', at: (v) => v.heat > 0, set: (to, on) => ({ heat: to ? on.heat || 1 : 0 }) } },
    { key: 'bands', kind: 'range', label: 'Glow in rings', address: 'bands', min: 0, max: 2, step: 1, unit: 'count', whole: true },
    { key: 'selout', kind: 'toggle', label: 'Softer outline on lit sides', address: 'selout' },
    { key: 'cycle', kind: 'toggle', label: 'Color cycling', tab: 'switches', address: 'cycle', when: (v, on) => pixelArt(v, on) && !!on.cycle },
    { key: 'rock', kind: 'toggle', label: 'Rock the view', tab: 'switches', address: 'rock' },
    { key: 'exact', kind: 'toggle', label: 'Exact sort', address: 'sort', on: 'radix' },
  ],
}

/** Tech glitch: pixel art with bursts laid on, so it has pixel art's settings and these. */
export const GLITCH_DEF: StyleDef<GlitchChoice> = {
  id: 'glitch', styles: ['glitch'], start: GLITCH_START,
  settings: [
    { key: 'amount', kind: 'choice', label: 'Bursts', options: GLITCH_AMOUNTS.map((a) => ({ id: a.amount, label: a.label })) },
    { key: 'strength', kind: 'range', label: 'Strength', min: 0.1, max: 1, step: 0.05, unit: 'percent', hint: 'How far rows slide, how far the colors split and how many blocks break up in a burst.' },
    { key: 'pace', kind: 'choice', label: 'Steps a second', options: GLITCH_PACE_CHOICES.map((p) => ({ id: p, label: String(p), about: 'A burst jumps from one state to the next this often, with nothing in between.' })) },
    { key: 'jitter', kind: 'toggle', label: 'Scanline jitter' },
    { key: 'split', kind: 'toggle', label: 'Color split' },
    { key: 'blocks', kind: 'toggle', label: 'Broken blocks' },
    { key: 'seed', kind: 'seed', label: 'New bursts', hint: 'The bursts follow the scene\'s loop, so an exported loop joins up. This picks another run of them.' },
  ],
}

/** The settings the brush marks and the plain blobs share: mark size, outline, pen and paper. */
export const MARKS: StyleDef<MarkSettings> = {
  id: 'marks', styles: ['gouache', 'oil', 'ink', 'hatch', 'stipple', 'blobs'],
  start: { size: 1, outline: null, pen: 1.5, paper: PAPERS[0].id, palette: 'none' },
  settings: [
    { key: 'palette', kind: 'choice', label: 'Palette', address: 'palette', testid: 'drawn-palettes', options: [{ id: 'none', label: 'Full color' }], open: true, when: (_v, on) => on.style !== 'hatch' && on.style !== 'stipple' },
    { key: 'size', kind: 'range', label: 'Mark size', min: 0.5, max: 1.3, step: 0.05, unit: 'percent', when: (_v, on) => on.style !== 'blobs', hint: 'Smaller marks leave gaps between them; bigger ones overlap more.' },
    { key: 'outline', kind: 'toggle', label: 'Outlines', address: 'outline', testid: 'brush-outline', auto: (style) => PEN_LOOKS.includes(style), about: 'A pen line round the subject, where one thing stands in front of another, and between its parts. Heavier against dark things, and it lifts off here and there against light ones.' },
    { key: 'pen', kind: 'range', label: 'Pen width', min: 0.75, max: 3, step: 0.25, unit: 'px', when: (v, on) => v.outline ?? PEN_LOOKS.includes(on.style) },
    { key: 'paper', kind: 'choice', label: 'Paper', options: PAPERS, when: (_v, on) => PEN_LOOKS.includes(on.style) },
  ],
}

/** What a picture drawn as words says until the visitor writes something else. */
export const WORDS_START = 'Every blob a letter. '

/** The settings of the picture drawn as characters. */
export const ASCII: StyleDef<AsciiSettings> = {
  id: 'ascii', styles: ['ascii'],
  start: { chars: 'ascii', letter: 12, weight: 1, strokes: true, strands: true, own: true, paper: PAPERS[0].id, words: WORDS_START, palette: 'none' },
  settings: [
    { key: 'chars', kind: 'choice', label: 'Characters', address: 'chars', testid: 'brush-chars', options: [
      { id: 'ascii', label: 'ASCII', about: 'Letters and signs by how much there is to show, and strokes along edges.' },
      { id: 'braille', label: 'Braille', about: 'Eight dots a cell, each on where its eighth of the cell is heavy enough, so shapes come out finer than a character. Idea from Silicon Jungle\'s Ink Studio.' },
      { id: 'words', label: 'Words', about: 'Your words, written over and over through the picture, each letter as bright as what it stands on.' },
      { id: 'typed', label: 'Typewriter', about: 'Keys struck once, or twice over one another for the darkest places, each strike a little out of line and the ribbon worn unevenly.' },
    ] },
    { key: 'words', kind: 'text', label: 'Words', address: 'words', most: 120, testid: 'brush-words', when: (v) => v.chars === 'words', hint: 'Letters, digits and , ! ? \' ; ( ) " in capitals. Anything else is a space.' },
    { key: 'letter', kind: 'range', label: 'Character size', min: 8, max: 24, step: 2, unit: 'px', hint: 'How tall a character is. Smaller ones show more of the picture; bigger ones are easier to read.' },
    { key: 'weight', kind: 'range', label: 'Weight', min: 0.5, max: 2, step: 0.1, unit: 'percent', hint: 'Over 100% every cell takes a heavier character than its tone asks for, which suits a dim scene.' },
    { key: 'strokes', kind: 'toggle', label: 'Strokes along edges', testid: 'brush-strokes', when: (v) => v.chars === 'ascii', about: 'Where an edge runs through a cell it gets | _ / or \\ by the way the edge runs, in place of a character for its tone.' },
    { key: 'strands', kind: 'toggle', label: 'Strokes along fur and grass', testid: 'brush-strands', when: (v) => v.chars === 'ascii', about: 'A cell that is mostly long thin blobs, such as strands of fur or blades of grass, gets the stroke nearest the way they run.' },
    { key: 'own', kind: 'toggle', label: 'Their own colors', testid: 'brush-own', about: 'Each character takes the color of what it stands for, on a dark screen. Off, they are one ink on paper.' },
    { key: 'paper', kind: 'choice', label: 'Paper', options: PAPERS, when: (v) => !v.own },
    { key: 'palette', kind: 'choice', label: 'Palette', address: 'palette', testid: 'drawn-palettes', options: [{ id: 'none', label: 'Full color' }], open: true, when: (v) => v.own },

  ],
}

/** Box Art's sets of characters, which Text drew until 2026-11-25: `?style=ascii&chars=lines` is Box Art now. */
export const BOX_SETS: readonly string[] = ['lines', 'blocks']

/** The settings of the picture drawn as Box Art (Matt, 2026-11-25: box drawing and quarter blocks, out of Text). */
export const BOX_ART: StyleDef<BoxArtSettings> = {
  id: 'boxart', styles: ['boxart'],
  start: { chars: 'lines', letter: 12, weight: 1, own: true, paper: PAPERS[0].id, palette: 'none' },
  settings: [
    { key: 'chars', kind: 'choice', label: 'Characters', address: 'chars', testid: 'brush-chars', options: [
      { id: 'lines', label: 'Box drawing', about: 'Only the edges, in the box-drawing characters ─ │ ┌ ┼ that join from cell to cell, with a dot where there is something to show.' },
      { id: 'blocks', label: 'Quarter blocks', about: 'Quarter blocks where a cell is half one thing and half another, and the shades ░ ▒ ▓ where it is even. Idea from Silicon Jungle\'s Ink Studio.' },
    ] },
    { key: 'letter', kind: 'range', label: 'Character size', min: 8, max: 24, step: 2, unit: 'px', hint: 'How tall a character is. Smaller ones show more of the picture; bigger ones are easier to read.' },
    { key: 'weight', kind: 'range', label: 'Weight', min: 0.5, max: 2, step: 0.1, unit: 'percent', hint: 'Over 100% every cell takes a heavier character than its tone asks for, which suits a dim scene.' },
    { key: 'own', kind: 'toggle', label: 'Their own colors', testid: 'brush-own', about: 'Each character takes the color of what it stands for, on a dark screen. Off, they are one ink on paper.' },
    { key: 'paper', kind: 'choice', label: 'Paper', options: PAPERS, when: (v) => !v.own },
    { key: 'palette', kind: 'choice', label: 'Palette', address: 'palette', testid: 'drawn-palettes', options: [{ id: 'none', label: 'Full color' }], open: true, when: (v) => v.own },
  ],
}

/** Cel shading's settings. */
export const CEL_DEF: StyleDef<CelSettings> = {
  id: 'cel', styles: ['cel'],
  start: { turn: CEL_START.turn, height: CEL_START.height, tones: CEL_START.tones, shadows: CEL_START.shadows, smooth: CEL_START.smooth, fills: CEL_START.fills, backdrop: '', outline: true, pen: CEL_START.line, palette: 'none' },
  settings: [
    { ...turn<CelSettings>(), address: 'turn' },
    { ...height<CelSettings>(), address: 'height' },
    { key: 'tones', kind: 'choice', label: 'Tones', address: 'tones', options: [{ id: 2, label: 'Light and shade' }, { id: 3, label: 'Three tones' }] },
    { key: 'shadows', kind: 'toggle', label: 'Cast shadows', address: 'shadows' },
    { key: 'smooth', kind: 'range', label: 'Shadow shapes', address: 'smooth', min: 1, max: 12, step: 0.5, unit: 'px', hint: 'How far the light is smoothed over a surface before it is cut into tones: more gives rounder, simpler shapes.' },
    { key: 'palette', kind: 'choice', label: 'Palette', address: 'palette', testid: 'drawn-palettes', options: [{ id: 'none', label: 'Full color' }], open: true },
    { key: 'fills', kind: 'range', label: 'Colors in each part', address: 'fills', min: 0, max: 4, step: 1, unit: 'count', zero: 'As painted', whole: true, hint: 'Each part\'s colors gathered into a few flat ones, so a mottled surface becomes areas of one color and a stripe stays a stripe.' },
    { key: 'backdrop', kind: 'choice', label: 'Backdrop', options: [{ id: 'scene', label: 'Scene\'s sky' }, ...BACKDROPS] },
    { key: 'outline', kind: 'toggle', label: 'Outlines', address: 'outline', testid: 'brush-outline', about: 'An even line round the subject, where one thing stands in front of another, and between its parts.' },
    { key: 'pen', kind: 'range', label: 'Pen width', min: 0.75, max: 3, step: 0.25, unit: 'px', when: (v) => v.outline },
  ],
}

/** The settings of the Blocks style. */
export const BLOCKS_DEF: StyleDef<BlockChoice> = {
  id: 'blocks', styles: ['blocks'], start: BLOCK_START,
  settings: [
    { key: 'size', kind: 'range', label: 'Block size', address: 'block', min: BLOCK_SIZES.min, max: BLOCK_SIZES.max, step: 1, unit: 'times', whole: true, hint: 'How big a block is beside the grid the scene was cut on. Bigger blocks suit a big scene; a small creature loses its face.' },
    { key: 'palette', kind: 'choice', label: 'Palette', address: 'palette', testid: 'drawn-palettes', options: [{ id: 'none', label: 'Full color' }], open: true },
    turn<BlockChoice>(),
    height<BlockChoice>(),
    { key: 'shadows', kind: 'toggle', label: 'Cast shadows' },
    { key: 'corners', kind: 'range', label: 'Dark corners', min: 0, max: 1, step: 0.05, unit: 'percent', hint: 'How much darker a face gets in a corner where blocks meet.' },
    { key: 'edge', kind: 'range', label: 'Block edges', min: 0, max: 1, step: 0.05, unit: 'percent', zero: 'None', hint: 'A thin line round each face, so blocks of one color still read as blocks.' },
    { key: 'vary', kind: 'range', label: 'Color varies', min: 0, max: 1, step: 0.05, unit: 'percent', hint: 'How much one block\'s color differs from the next\'s.' },
    { key: 'water', kind: 'choice', label: 'Water ripples', address: 'water', testid: 'block-water', when: (_v, on) => !!on.water, options: [
      { id: 'blobs', label: 'As blobs', about: 'The water stays soft blobs among the cubes, as in the other styles.' },
      { id: 'blocks', label: 'As blocks', about: 'The water is columns of blocks: each rises and falls in quarter steps of a block as the ripples pass.' },
    ] },
    { key: 'weather', kind: 'choice', label: 'Weather drawn as', address: 'falls', testid: 'block-weather', when: (_v, on) => !!on.weather, options: [
      { id: 'blobs', label: 'Soft blobs', about: 'Clouds, rain and snow stay soft blobs among the cubes, as in the other styles.' },
      { id: 'blocks', label: 'Blocks', about: 'Clouds, rain and snow are cubes too: clouds in blocks of the scene\'s size, every drop and flake a small cube.' },
    ] },
    { key: 'swell', kind: 'range', label: 'Ripple height', address: 'swell', min: 0, max: SWELL_MOST, step: 1, unit: 'times', zero: 'Flat', when: (v, on) => !!on.water && v.water === 'blocks', hint: 'How many times higher than it really stands a ripple is built. Flat keeps the tops level, so only the color moves.' },
    { key: 'backdrop', kind: 'choice', label: 'Backdrop', address: 'backdrop', testid: 'block-backdrop', options: [{ id: 'scene', label: 'Scene\'s own' }, ...BLOCK_GROUNDS] },
  ],
}

/** Neon's settings. */
export const NEON_DEF: StyleDef<NeonChoice> = {
  id: 'neon', styles: ['neon'], start: NEON_START,
  settings: [
    { key: 'set', kind: 'choice', label: 'Colors', options: NEON_SETS.map((s) => ({ id: s.id, label: s.label, about: 'Their own gives each tube the color of the thing it goes round, at full strength. The others deal a set of colors out part by part.' })) },
    { key: 'palette', kind: 'choice', label: 'Palette', address: 'palette', testid: 'drawn-palettes', options: [{ id: 'none', label: 'Full color' }], open: true, when: (v) => v.set === 'own' },
    { key: 'pace', kind: 'choice', label: 'Light runs', options: NEON_PACES },
    { key: 'line', kind: 'range', label: 'Tube width', min: 1, max: 5, step: 0.5, unit: 'px' },
    { key: 'glow', kind: 'range', label: 'Glow', min: 0, max: 2, step: 0.1, unit: 'percent', hint: 'How far the tubes\' light spills round them and onto the bodies beside them.' },
    { key: 'body', kind: 'range', label: 'Bodies', min: 0, max: 0.3, step: 0.01, unit: 'percent', hint: 'How much of its own color a body keeps where no tube\'s light reaches it.' },
  ],
}

/** Stained glass's settings. */
export const GLASS_DEF: StyleDef<GlassChoice> = {
  id: 'glass', styles: ['glass'], start: GLASS_START,
  settings: [
    { key: 'palette', kind: 'choice', label: 'Palette', address: 'palette', testid: 'drawn-palettes', options: [{ id: 'none', label: 'Full color' }], open: true },
    { key: 'pane', kind: 'range', label: 'Pane size', min: 0.03, max: 0.15, step: 0.01, unit: 'percent', hint: 'How big a pane is beside the whole scene. Panes are fixed in the scene, so they stay on their surfaces as the view turns.' },
    { key: 'lead', kind: 'range', label: 'Lead width', min: 1, max: 5, step: 0.5, unit: 'px' },
    { key: 'shine', kind: 'range', label: 'Light behind', min: 0, max: 1, step: 0.05, unit: 'percent', hint: 'How much brighter the window is where the light stands behind it than at its corners.' },
    { key: 'vary', kind: 'range', label: 'Glass varies', min: 0, max: 1, step: 0.05, unit: 'percent', hint: 'How much one pane\'s glass differs from the next\'s.' },
  ],
}

/** Watercolor's settings. */
export const WASH_DEF: StyleDef<WashChoice> = {
  id: 'watercolor', styles: ['watercolor'], start: WASH_START,
  settings: [
    { key: 'palette', kind: 'choice', label: 'Palette', address: 'palette', testid: 'drawn-palettes', options: [{ id: 'none', label: 'Full color' }], open: true },
    { key: 'bleed', kind: 'range', label: 'Edges run', min: 0, max: 14, step: 1, unit: 'px', hint: 'How far a wash\'s edge wanders over the paper.' },
    { key: 'pool', kind: 'range', label: 'Dark edges', min: 0, max: 1, step: 0.05, unit: 'percent', hint: 'Paint pools where a wash ends or its color changes, and dries darker there.' },
    { key: 'grain', kind: 'range', label: 'Paper grain', min: 0, max: 1, step: 0.05, unit: 'percent' },
    { key: 'strength', kind: 'range', label: 'Paint strength', min: 0.3, max: 1, step: 0.05, unit: 'percent', hint: 'Lower is paler, with more of the paper showing through.' },
    { key: 'pencil', kind: 'range', label: 'Pencil', min: 0, max: 1, step: 0.05, unit: 'percent', zero: 'None', hint: 'A pencil line under the paint, round each thing and between its parts.' },
    { key: 'paper', kind: 'choice', label: 'Paper', options: WASH_PAPERS },
    { key: 'border', kind: 'toggle', label: 'Paper border', address: 'border', about: 'Leaves a border of bare paper round the painting. Off, the wash behind the subject runs to the edge.' },
  ],
}

/** Knitting's settings. */
export const KNIT_DEF: StyleDef<KnitChoice> = {
  id: 'knit', styles: ['knit'], start: KNIT_START,
  settings: [
    { key: 'sweater', kind: 'choice', label: 'Sweater', address: 'sweater', testid: 'knit-sweater', options: KNIT_SWEATERS.map((s) => ({ id: s.id, label: s.label, about: 'The yarn the sweater is knitted in. The picture and the pattern take the other yarns in its basket.' })) },
    { key: 'pattern', kind: 'choice', label: 'Pattern', address: 'pattern', testid: 'knit-pattern', options: KNIT_PATTERNS.map((p) => ({ id: p.id, label: p.label, about: 'Bands knitted in above and below the picture. A band too tall for the view is left out, so smaller stitches show more of them.' })) },
    { key: 'stitch', kind: 'range', label: 'Stitch size', address: 'stitch', min: 5, max: 20, step: 1, unit: 'px', whole: true, hint: 'How wide a stitch is. Smaller stitches show more of the picture and more of the pattern; bigger ones show the yarn.' },
    { key: 'snow', kind: 'toggle', label: 'Snow dots', address: 'snow', about: 'Single stitches of the pattern\'s yarn scattered evenly over the plain part of the sweater.' },
  ],
}

/**
 * The scene's own settings, which every style respects: '' is the scene as it is written (its own weather, its own
 * time), and a detail of '' is the one its style starts at (`detailStart`). Weather and cloud cover are one choice on
 * the page (a weather brings its own clouds), kept as two so a cover can be told from a weather.
 */
export interface SceneSettings {
  /** The time of day; '' is the scene as written. */
  time: TimeId | ''
  /** The weather; '' is the scene's own, 'none' turns a scene's own off. */
  weather: WeatherId | 'none' | ''
  /** The cloud cover; '' is the scene's own. */
  clouds: CloudId | ''
  /** The wind; '' is what the weather brings. */
  wind: WindId | ''
  /** Clouds floating over the scene; null is the scene's own way. */
  overhead: boolean | null
  /** How one scene gives way to the next; 'cut' is at once. */
  transition: TransitionKind | 'cut'
  /** The detail the scene is cut at, an id of `SCENE_DETAIL`; '' is the one its style starts at. */
  detail: string
}

const OWN = { id: '', label: 'Scene’s own' }
/** The scene's own settings, written as a style's are so the same code reads, keeps and draws them. */
export const SCENE: StyleDef<SceneSettings> = {
  id: 'scene', styles: [],
  start: { time: '', weather: '', clouds: '', wind: '', overhead: null, transition: TRANSITIONS[0].id, detail: '' },
  settings: [
    { key: 'time', kind: 'choice', label: 'Time of day', address: 'time', options: [OWN, ...TIMES] },
    { key: 'weather', kind: 'choice', label: 'Weather', address: 'weather', options: [OWN, { id: 'none', label: 'No weather' }, ...WEATHERS] },
    { key: 'clouds', kind: 'choice', label: 'Clouds', address: 'clouds', options: [{ id: '', label: 'None' }, ...CLOUD_COVERS] },
    { key: 'wind', kind: 'choice', label: 'Wind', address: 'wind', options: [{ id: '', label: 'The weather’s own' }, ...WINDS.map((w, i) => ({ id: w.id, label: i ? w.label : 'No wind' }))] },
    { key: 'overhead', kind: 'toggle', label: 'Clouds over the scene', address: 'overhead', auto: () => true },
    { key: 'transition', kind: 'choice', label: 'Changing scenes', address: 'transition', options: [...TRANSITIONS.map((t) => ({ id: t.id, label: t.name })), { id: 'cut', label: 'Cut' }] },
    { key: 'detail', kind: 'choice', label: 'Detail', address: 'detail', options: [{ id: '', label: 'The style’s own' }, ...SCENE_DETAIL] },
  ],
}

/** The scene's settings as they start, with what the address asks (`?time=night`, `?weather=snow`, `?wind=gale`, `?transition=cut`, `?detail=fine`). */
export const sceneStart = (q: URLSearchParams = new URLSearchParams()): SceneSettings => fromAddress(SCENE, SCENE.start, q)

/** Every style's settings, by the name they are kept under. */
export const CATALOG = { pixel: PIXEL, glitch: GLITCH_DEF, marks: MARKS, ascii: ASCII, boxart: BOX_ART, cel: CEL_DEF, blocks: BLOCKS_DEF, neon: NEON_DEF, glass: GLASS_DEF, watercolor: WASH_DEF, knit: KNIT_DEF } as const
/** A name settings are kept under: a key of `CATALOG`. */
export type StyleKey = keyof typeof CATALOG

/** Each style's settings: what a page holds beside which style is on show. */
export interface StylesValue {
  /** Pixel art's. */
  pixel: PixelSettings
  /** Tech glitch's, on top of pixel art's. */
  glitch: GlitchChoice
  /** The brush marks' and the plain blobs'. */
  marks: MarkSettings
  /** The characters'. */
  ascii: AsciiSettings
  /** Box Art's. */
  boxart: BoxArtSettings
  /** Cel shading's. */
  cel: CelSettings
  /** The Blocks style's. */
  blocks: BlockChoice
  /** Neon's. */
  neon: NeonChoice
  /** Stained glass's. */
  glass: GlassChoice
  /** Watercolor's. */
  watercolor: WashChoice
  /** Knitting's. */
  knit: KnitChoice
}
/** The settings of the looks `useDrawnLook` draws: every style but pixel art and its glitch. */
export type DrawnSettings = Omit<StylesValue, 'pixel' | 'glitch'>
/** How a scene is drawn: the style, every style's settings (so going to another style and back loses nothing), and the scene's own. */
export interface StyleValue {
  /** The style on show. */
  style: Style
  /** Every style's settings. */
  styles: StylesValue
  /** The scene's own settings. */
  scene: SceneSettings
}

/** The settings a style uses, in the order they are laid on: tech glitch is pixel art's and its own. */
export const keysOf = (style: Style): StyleKey[] => (Object.keys(CATALOG) as StyleKey[]).filter((k) => (CATALOG[k].styles as readonly Style[]).includes(style))

/** A number held to a range setting. */
function held<V>(s: RangeSetting<V>, v: number): number {
  const w = s.whole ? Math.round(v) : v
  return Math.min(s.max, Math.max(s.min, w))
}

/** A style's settings as the address asks for them, over `start`: only settings with an `address`, and only sound values. */
export function fromAddress<V>(def: StyleDef<V>, start: V, q: URLSearchParams): V {
  const out = { ...start } as Record<string, unknown>
  for (const s of def.settings) {
    const asked = s.address ? q.get(s.address) : null
    if (asked === null) continue
    if (s.kind === 'range') { const v = asked === '' ? NaN : Number(asked); if (Number.isFinite(v)) out[s.key] = held(s, v) }
    else if (s.kind === 'choice') { const o = s.options.find((x) => String(x.id) === asked); if (o) out[s.key] = o.id; else if (s.open && /^[a-z0-9-]{1,32}$/.test(asked)) out[s.key] = asked }
    else if (s.kind === 'toggle') { if (s.on) out[s.key] = asked === s.on; else if (asked === '1') out[s.key] = true; else if (asked === '0') out[s.key] = false }
    else if (s.kind === 'text') { if (asked.trim()) out[s.key] = asked.slice(0, s.most) }
  }
  return out as V
}

/** Settings that were kept (a saved scene, a link) read back over `start`: each one kept only where the catalog finds it sound. */
export function settingsFrom<V>(def: StyleDef<V>, start: V, kept: unknown): V {
  if (!kept || typeof kept !== 'object') return start
  const got = kept as Record<string, unknown>, out = { ...start } as Record<string, unknown>
  for (const s of def.settings) {
    const g = got[s.key]
    if (s.kind === 'range' || s.kind === 'seed') { if (typeof g === 'number' && Number.isFinite(g)) out[s.key] = s.kind === 'range' ? held(s, g) : Math.max(0, Math.round(g)) }
    else if (s.kind === 'choice') { if (s.open ? typeof g === 'string' : s.options.some((o) => o.id === g) || (g === '' && (start as Record<string, unknown>)[s.key] === '')) out[s.key] = g }
    else if (s.kind === 'text') { if (typeof g === 'string') out[s.key] = g.slice(0, s.most) }
    else if (typeof g === 'boolean' || (g === null && (def.start as Record<string, unknown>)[s.key] === null)) out[s.key] = g
  }
  return out as V
}

/** What a page tells the start about itself. */
export interface StartFor {
  /** A phone or tablet: knitting starts two pixels a stitch finer, so its bands fit a small view. */
  coarse?: boolean
}

/** The drawn looks' settings as they start, with what the address asks (`?block=`, `?tones=3`, `?chars=braille`, `?outline=0`, …). */
export function drawnStart(q: URLSearchParams = new URLSearchParams(), on: StartFor = {}): DrawnSettings {
  return {
    marks: fromAddress(MARKS, MARKS.start, q),
    ascii: fromAddress(ASCII, ASCII.start, q),
    boxart: fromAddress(BOX_ART, BOX_ART.start, q),
    cel: fromAddress(CEL_DEF, CEL_DEF.start, q),
    blocks: fromAddress(BLOCKS_DEF, BLOCKS_DEF.start, q),
    neon: fromAddress(NEON_DEF, NEON_DEF.start, q),
    glass: fromAddress(GLASS_DEF, GLASS_DEF.start, q),
    watercolor: fromAddress(WASH_DEF, WASH_DEF.start, q),
    knit: fromAddress(KNIT_DEF, on.coarse ? { ...KNIT_DEF.start, stitch: KNIT_DEF.start.stitch - 2 } : KNIT_DEF.start, q),
  }
}

/** Box Art's kept settings, or, from a scene kept before it was its own style, Text's when they were drawn in its characters. */
function boxArtKept(got: Record<string, unknown>): unknown {
  if (got.boxart) return got.boxart
  const old = got.ascii as { chars?: unknown } | undefined
  return old && BOX_SETS.includes(old.chars as string) ? old : undefined
}

/** Kept drawn settings read back over a start: `kept` is an object by style (`{ cel: {…}, blocks: {…} }`), any of it missing or unsound left as it starts. */
export function drawnFrom(start: DrawnSettings, kept: unknown): DrawnSettings {
  const got = (kept && typeof kept === 'object' ? kept : {}) as Record<string, unknown>
  return {
    marks: settingsFrom(MARKS, start.marks, got.marks),
    ascii: settingsFrom(ASCII, start.ascii, got.ascii),
    boxart: settingsFrom(BOX_ART, start.boxart, boxArtKept(got)),
    cel: settingsFrom(CEL_DEF, start.cel, got.cel),
    blocks: settingsFrom(BLOCKS_DEF, start.blocks, got.blocks),
    neon: settingsFrom(NEON_DEF, start.neon, got.neon),
    glass: settingsFrom(GLASS_DEF, start.glass, got.glass),
    watercolor: settingsFrom(WASH_DEF, start.watercolor, got.watercolor),
    knit: settingsFrom(KNIT_DEF, start.knit, got.knit),
  }
}

/** A setting's value as words, as its slider shows it. */
export function valueWords<V>(s: RangeSetting<V>, v: number): string {
  if (v === 0 && s.zero) return s.zero
  if (s.unit === 'percent') return `${Math.round(v * 100)}%`
  if (s.unit === 'px') return `${v} px`
  if (s.unit === 'deg') return `${v}°`
  if (s.unit === 'times') return `${v}×`
  return `${v}`
}

/** The settings a page shows for a style (in one of its tabs, where it has them): those whose `when` holds, and no other page's trials. */
export function shownSettings<V>(def: StyleDef<V>, value: V, on: Shows, page?: string, tab?: Tab): StyleSetting<V>[] {
  return def.settings.filter((s) => s.tab === tab && (!s.trial || s.trial === page) && (!s.when || s.when(value, on)))
}

