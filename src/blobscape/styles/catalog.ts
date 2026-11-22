import type { GlyphSet } from '../../splat-core/glyphs.ts'
import type { Style } from '../diorama/styles.ts'
import { DETAIL } from '../diorama/scene.ts'
import { TIMES, type TimeId } from '../timeOfDay.ts'
import { TRANSITIONS, type TransitionKind } from '../../splat-core/transition.ts'
import { CLOUD_COVERS, WEATHERS, WINDS, type CloudId, type WeatherId, type WindId } from '../../splat-engine/skyRecipes.ts'
import { BLOCK_GROUNDS, BLOCK_SIZES, BLOCK_START, SWELL_MOST, type BlockChoice } from '../blockLooks.ts'
import { PAPERS } from '../brushLooks.ts'
import { BACKDROPS, CEL_START } from '../celLooks.ts'
import { GLASS_START, type GlassChoice } from '../glassLooks.ts'
import { GLITCH_AMOUNTS, GLITCH_PACE_CHOICES, GLITCH_START, type GlitchChoice } from '../glitchLooks.ts'
import { NEON_PACES, NEON_SETS, NEON_START, type NeonChoice } from '../neonLooks.ts'
import { WASH_PAPERS, WASH_START, type WashChoice } from '../washLooks.ts'

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
export interface Shows { style: Style; water?: boolean; weather?: boolean; cycle?: boolean }

interface Base<V> {
  key: keyof V & string
  label: string
  /** A line under the control. */
  hint?: string
  /** Its name in the address (`?block=3`). */
  address?: string
  /** Whether it is shown, by the style's own settings and the page; a hidden setting keeps its value. */
  when?: (v: V, on: Shows) => boolean
  testid?: string
  /** An experiment's own try: the name of the one page that shows it, until it is folded in by taking this off. */
  trial?: string
}
/** A slider. */
export interface RangeSetting<V> extends Base<V> { kind: 'range'; min: number; max: number; step: number; unit: Unit; /** What 0 reads as ("None"). */ zero?: string; /** Held to whole steps. */ whole?: boolean }
/** One of a few, as chips. `open` choices are the page's to list (a scene's palettes): any id is kept. */
export interface ChoiceSetting<V> extends Base<V> { kind: 'choice'; options: readonly { id: string | number; label: string; about?: string }[]; open?: boolean }
/** A switch. One that starts `null` follows its style (`auto`) until the visitor says. `on` is the address's word for it when not 1. */
export interface ToggleSetting<V> extends Base<V> { kind: 'toggle'; about?: string | ((style: Style) => string); auto?: (style: Style) => boolean; on?: string }
/** A whole number a button moves on, for another run of something random. */
export interface SeedSetting<V> extends Base<V> { kind: 'seed' }
export type Setting<V> = RangeSetting<V> | ChoiceSetting<V> | ToggleSetting<V> | SeedSetting<V>

/** One style's settings (or those of a few styles that share them, as the brush marks do). */
export interface StyleDef<V> {
  id: string
  /** The styles that use these settings. */
  styles: readonly Style[]
  /** Where every setting starts. */
  start: V
  settings: readonly Setting<V>[]
}

// ---- the settings of each style ----

/** The brush marks (gouache, oil, ink and wash, hatching, stipple) and the plain blobs, which can take the pen's outline too. */
export interface MarkSettings { size: number; /** null: on for the pen looks, off for paint. */ outline: boolean | null; pen: number; paper: string }
export interface AsciiSettings { chars: GlyphSet; letter: number; weight: number; strokes: boolean; strands: boolean; own: boolean; paper: string }
export interface CelSettings { turn: number; height: number; tones: 2 | 3; shadows: boolean; smooth: number; fills: number; /** '' is the subject's own sky where it has one. */ backdrop: string; outline: boolean; pen: number }

/** Pixel art's settings, as the Style and Finish controls set them. */
export interface PixelSettings {
  /** The palette's id: 'own' is the scene's, else one of the shared ones. */
  palette: string
  /** Each art pixel this many device pixels across. */
  size: number
  /** Frames a second the scene moves at; 0 is every frame the screen shows. */
  rate: number
  dither: number
  /** How strongly glowing things light what is round them and shine into the pixels beside them. */
  glow: number
  /** A line round the scene, and whether it takes a darker tone of each thing it goes round. */
  outline: boolean
  own: boolean
  /** Lines inside the scene: where things meet (and, where the scene asks, where colors jump). */
  lines: boolean
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

/** Pixel sizes and paces on offer. */
export const PIXEL_SIZES = [2, 3, 4, 6]
export const PIXEL_RATES = [0, 12, 8]

const PEN_LOOKS: readonly Style[] = ['ink', 'hatch', 'stipple']
const turn = <V extends { turn: number }>(): RangeSetting<V> => ({ key: 'turn' as keyof V & string, kind: 'range', label: 'Light from', min: -180, max: 180, step: 5, unit: 'deg', hint: 'Round the subject, from where the view starts: 0° is from the front, 90° from the right. The shadows go with it.' })
const height = <V extends { height: number }>(): RangeSetting<V> => ({ key: 'height' as keyof V & string, kind: 'range', label: 'Light height', min: 10, max: 85, step: 1, unit: 'deg' })

/**
 * Pixel art. Where a scene has a finish of its own it starts these (`pixelStart` in styleSettings.ts); this start is
 * a scene with none. The page lays these controls out itself (`StyleControls.tsx`), since the palette's strip and the
 * outline's three chips are each more than one setting.
 */
export const PIXEL: StyleDef<PixelSettings> = {
  id: 'pixel', styles: ['pixel', 'glitch'],
  start: { palette: 'own', size: 2, rate: 0, dither: 0.5, glow: 1, outline: true, own: true, lines: true, sky: true, heat: 0, bands: 2, selout: true, cycle: true, steps: false, texel: 0, shade: false, rock: true, exact: false },
  settings: [
    { key: 'palette', kind: 'choice', label: 'Palette', options: [{ id: 'own', label: 'Scene’s own' }], open: true },
    { key: 'size', kind: 'choice', label: 'Pixel size', address: 'px', options: PIXEL_SIZES.map((n) => ({ id: n, label: `${n}×` })) },
    { key: 'rate', kind: 'choice', label: 'Motion', options: PIXEL_RATES.map((n) => ({ id: n, label: n ? `${n} a second` : 'Smooth' })) },
    { key: 'dither', kind: 'range', label: 'Dither', min: 0, max: 1, step: 0.05, unit: 'percent' },
    { key: 'glow', kind: 'range', label: 'Glow', address: 'glow', min: 0, max: 4, step: 0.25, unit: 'times', zero: 'off' },
    { key: 'steps', kind: 'toggle', label: 'Paint in steps of the palette', address: 'steps' },
    { key: 'texel', kind: 'range', label: 'Light in bands', address: 'texel', min: 0, max: 8, step: 1, unit: 'count', whole: true },
    { key: 'shade', kind: 'toggle', label: 'Shade each pixel', address: 'shade' },
    { key: 'outline', kind: 'toggle', label: 'Outline' },
    { key: 'own', kind: 'toggle', label: 'Outline in each thing’s own color', address: 'own' },
    { key: 'lines', kind: 'toggle', label: 'Lines inside the scene', address: 'parts' },
    { key: 'sky', kind: 'toggle', label: 'Sky behind' },
    { key: 'heat', kind: 'range', label: 'Heat haze over glowing things', address: 'heat', min: 0, max: 3, step: 1, unit: 'px', whole: true },
    { key: 'bands', kind: 'range', label: 'Glow in rings', address: 'bands', min: 0, max: 2, step: 1, unit: 'count', whole: true },
    { key: 'selout', kind: 'toggle', label: 'Softer outline on lit sides', address: 'selout' },
    { key: 'cycle', kind: 'toggle', label: 'Color cycling', address: 'cycle', when: (_v, on) => !!on.cycle },
    { key: 'rock', kind: 'toggle', label: 'Rock the view', address: 'rock' },
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

export const MARKS: StyleDef<MarkSettings> = {
  id: 'marks', styles: ['gouache', 'oil', 'ink', 'hatch', 'stipple', 'blobs'],
  start: { size: 1, outline: null, pen: 1.5, paper: PAPERS[0].id },
  settings: [
    { key: 'size', kind: 'range', label: 'Mark size', min: 0.5, max: 1.3, step: 0.05, unit: 'percent', when: (_v, on) => on.style !== 'blobs', hint: 'Smaller marks leave gaps between them; bigger ones overlap more.' },
    { key: 'outline', kind: 'toggle', label: 'Outlines', address: 'outline', testid: 'brush-outline', auto: (style) => PEN_LOOKS.includes(style), about: 'A pen line round the subject, where one thing stands in front of another, and between its parts. Heavier against dark things, and it lifts off here and there against light ones.' },
    { key: 'pen', kind: 'range', label: 'Pen width', min: 0.75, max: 3, step: 0.25, unit: 'px', when: (v, on) => v.outline ?? PEN_LOOKS.includes(on.style) },
    { key: 'paper', kind: 'choice', label: 'Paper', options: PAPERS, when: (_v, on) => PEN_LOOKS.includes(on.style) },
  ],
}

export const ASCII: StyleDef<AsciiSettings> = {
  id: 'ascii', styles: ['ascii'],
  start: { chars: 'ascii', letter: 12, weight: 1, strokes: true, strands: true, own: true, paper: PAPERS[0].id },
  settings: [
    { key: 'chars', kind: 'choice', label: 'Characters', address: 'chars', testid: 'brush-chars', options: [
      { id: 'ascii', label: 'ASCII', about: 'Letters and signs by how much there is to show, and strokes along edges.' },
      { id: 'braille', label: 'Braille', about: 'Eight dots a cell, each on where its eighth of the cell is heavy enough, so shapes come out finer than a character. Idea from Silicon Jungle\'s Ink Studio.' },
      { id: 'blocks', label: 'Blocks', about: 'Quarter blocks where a cell is half one thing and half another, and the shades ░ ▒ ▓ where it is even. Idea from Silicon Jungle\'s Ink Studio.' },
    ] },
    { key: 'letter', kind: 'range', label: 'Character size', min: 8, max: 24, step: 2, unit: 'px', hint: 'How tall a character is. Smaller ones show more of the picture; bigger ones are easier to read.' },
    { key: 'weight', kind: 'range', label: 'Weight', min: 0.5, max: 2, step: 0.1, unit: 'percent', hint: 'Over 100% every cell takes a heavier character than its tone asks for, which suits a dim scene.' },
    { key: 'strokes', kind: 'toggle', label: 'Strokes along edges', testid: 'brush-strokes', when: (v) => v.chars === 'ascii', about: 'Where an edge runs through a cell it gets | _ / or \\ by the way the edge runs, in place of a character for its tone.' },
    { key: 'strands', kind: 'toggle', label: 'Strokes along fur and grass', testid: 'brush-strands', when: (v) => v.chars === 'ascii', about: 'A cell that is mostly long thin blobs, such as strands of fur or blades of grass, gets the stroke nearest the way they run.' },
    { key: 'own', kind: 'toggle', label: 'Their own colors', testid: 'brush-own', about: 'Each character takes the color of what it stands for, on a dark screen. Off, they are one ink on paper.' },
    { key: 'paper', kind: 'choice', label: 'Paper', options: PAPERS, when: (v) => !v.own },
  ],
}

export const CEL_DEF: StyleDef<CelSettings> = {
  id: 'cel', styles: ['cel'],
  start: { turn: CEL_START.turn, height: CEL_START.height, tones: CEL_START.tones, shadows: CEL_START.shadows, smooth: CEL_START.smooth, fills: CEL_START.fills, backdrop: '', outline: true, pen: CEL_START.line },
  settings: [
    { ...turn<CelSettings>(), address: 'turn' },
    { ...height<CelSettings>(), address: 'height' },
    { key: 'tones', kind: 'choice', label: 'Tones', address: 'tones', options: [{ id: 2, label: 'Light and shade' }, { id: 3, label: 'Three tones' }] },
    { key: 'shadows', kind: 'toggle', label: 'Cast shadows', address: 'shadows' },
    { key: 'smooth', kind: 'range', label: 'Shadow shapes', address: 'smooth', min: 1, max: 12, step: 0.5, unit: 'px', hint: 'How far the light is smoothed over a surface before it is cut into tones: more gives rounder, simpler shapes.' },
    { key: 'fills', kind: 'range', label: 'Colors in each part', address: 'fills', min: 0, max: 4, step: 1, unit: 'count', zero: 'As painted', whole: true, hint: 'Each part\'s colors gathered into a few flat ones, so a mottled surface becomes areas of one color and a stripe stays a stripe.' },
    { key: 'backdrop', kind: 'choice', label: 'Backdrop', options: [{ id: 'scene', label: 'Scene\'s sky' }, ...BACKDROPS] },
    { key: 'outline', kind: 'toggle', label: 'Outlines', address: 'outline', testid: 'brush-outline', about: 'An even line round the subject, where one thing stands in front of another, and between its parts.' },
    { key: 'pen', kind: 'range', label: 'Pen width', min: 0.75, max: 3, step: 0.25, unit: 'px', when: (v) => v.outline },
  ],
}

export const BLOCKS_DEF: StyleDef<BlockChoice> = {
  id: 'blocks', styles: ['blocks'], start: BLOCK_START,
  settings: [
    { key: 'size', kind: 'range', label: 'Block size', address: 'block', min: BLOCK_SIZES.min, max: BLOCK_SIZES.max, step: 1, unit: 'times', whole: true, hint: 'How big a block is beside the grid the scene was cut on. Bigger blocks suit a big scene; a small creature loses its face.' },
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

export const NEON_DEF: StyleDef<NeonChoice> = {
  id: 'neon', styles: ['neon'], start: NEON_START,
  settings: [
    { key: 'set', kind: 'choice', label: 'Colors', options: NEON_SETS.map((s) => ({ id: s.id, label: s.label, about: 'Their own gives each tube the color of the thing it goes round, at full strength. The others deal a set of colors out part by part.' })) },
    { key: 'pace', kind: 'choice', label: 'Light runs', options: NEON_PACES },
    { key: 'line', kind: 'range', label: 'Tube width', min: 1, max: 5, step: 0.5, unit: 'px' },
    { key: 'glow', kind: 'range', label: 'Glow', min: 0, max: 2, step: 0.1, unit: 'percent', hint: 'How far the tubes\' light spills round them and onto the bodies beside them.' },
    { key: 'body', kind: 'range', label: 'Bodies', min: 0, max: 0.3, step: 0.01, unit: 'percent', hint: 'How much of its own color a body keeps where no tube\'s light reaches it.' },
  ],
}

export const GLASS_DEF: StyleDef<GlassChoice> = {
  id: 'glass', styles: ['glass'], start: GLASS_START,
  settings: [
    { key: 'pane', kind: 'range', label: 'Pane size', min: 0.03, max: 0.15, step: 0.01, unit: 'percent', hint: 'How big a pane is beside the whole scene. Panes are fixed in the scene, so they stay on their surfaces as the view turns.' },
    { key: 'lead', kind: 'range', label: 'Lead width', min: 1, max: 5, step: 0.5, unit: 'px' },
    { key: 'shine', kind: 'range', label: 'Light behind', min: 0, max: 1, step: 0.05, unit: 'percent', hint: 'How much brighter the window is where the light stands behind it than at its corners.' },
    { key: 'vary', kind: 'range', label: 'Glass varies', min: 0, max: 1, step: 0.05, unit: 'percent', hint: 'How much one pane\'s glass differs from the next\'s.' },
  ],
}

export const WASH_DEF: StyleDef<WashChoice> = {
  id: 'watercolor', styles: ['watercolor'], start: WASH_START,
  settings: [
    { key: 'bleed', kind: 'range', label: 'Edges run', min: 0, max: 14, step: 1, unit: 'px', hint: 'How far a wash\'s edge wanders over the paper.' },
    { key: 'pool', kind: 'range', label: 'Dark edges', min: 0, max: 1, step: 0.05, unit: 'percent', hint: 'Paint pools where a wash ends or its color changes, and dries darker there.' },
    { key: 'grain', kind: 'range', label: 'Paper grain', min: 0, max: 1, step: 0.05, unit: 'percent' },
    { key: 'strength', kind: 'range', label: 'Paint strength', min: 0.3, max: 1, step: 0.05, unit: 'percent', hint: 'Lower is paler, with more of the paper showing through.' },
    { key: 'pencil', kind: 'range', label: 'Pencil', min: 0, max: 1, step: 0.05, unit: 'percent', zero: 'None', hint: 'A pencil line under the paint, round each thing and between its parts.' },
    { key: 'paper', kind: 'choice', label: 'Paper', options: WASH_PAPERS },
  ],
}

/**
 * The scene's own settings, which every style respects: '' is the scene as it is written (its own weather, its own
 * time), and a detail of '' is the one its style starts at (`detailStart`). Weather and cloud cover are one choice on
 * the page (a weather brings its own clouds), kept as two so a cover can be told from a weather.
 */
export interface SceneSettings { time: TimeId | ''; weather: WeatherId | 'none' | ''; clouds: CloudId | ''; wind: WindId | ''; /** Clouds floating over the scene; null is the scene's own way. */ overhead: boolean | null; transition: TransitionKind | 'cut'; detail: string }

const OWN = { id: '', label: 'Scene’s own' }
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
    { key: 'detail', kind: 'choice', label: 'Detail', address: 'detail', options: [{ id: '', label: 'The style’s own' }, ...DETAIL] },
  ],
}

/** The scene's settings as they start, with what the address asks (`?time=night`, `?weather=snow`, `?wind=gale`, `?transition=cut`, `?detail=fine`). */
export const sceneStart = (q: URLSearchParams = new URLSearchParams()): SceneSettings => fromAddress(SCENE, SCENE.start, q)

/** Every style's settings, by the name they are kept under. */
export const CATALOG = { pixel: PIXEL, glitch: GLITCH_DEF, marks: MARKS, ascii: ASCII, cel: CEL_DEF, blocks: BLOCKS_DEF, neon: NEON_DEF, glass: GLASS_DEF, watercolor: WASH_DEF } as const
export type StyleKey = keyof typeof CATALOG

/** Each style's settings: what a page holds beside which style is on show. */
export interface StylesValue { pixel: PixelSettings; glitch: GlitchChoice; marks: MarkSettings; ascii: AsciiSettings; cel: CelSettings; blocks: BlockChoice; neon: NeonChoice; glass: GlassChoice; watercolor: WashChoice }
/** The settings of the looks `useDrawnLook` draws: every style but pixel art and its glitch. */
export type DrawnSettings = Omit<StylesValue, 'pixel' | 'glitch'>
/** How a scene is drawn: the style, every style's settings (so going to another style and back loses nothing), and the scene's own. */
export interface StyleValue { style: Style; styles: StylesValue; scene: SceneSettings }

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
    else if (s.kind === 'choice') { const o = s.options.find((x) => String(x.id) === asked); if (o) out[s.key] = o.id }
    else if (s.kind === 'toggle') { if (s.on) out[s.key] = asked === s.on; else if (asked === '1') out[s.key] = true; else if (asked === '0') out[s.key] = false }
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
    else if (typeof g === 'boolean' || (g === null && (def.start as Record<string, unknown>)[s.key] === null)) out[s.key] = g
  }
  return out as V
}

/** What a page tells the start about itself. */
export interface StartFor { /** A phone or tablet: blocks start a size up, for fewer cubes. */ coarse?: boolean }

/** The drawn looks' settings as they start, with what the address asks (`?block=`, `?tones=3`, `?chars=braille`, `?outline=0`, …). */
export function drawnStart(q: URLSearchParams = new URLSearchParams(), on: StartFor = {}): DrawnSettings {
  return {
    marks: fromAddress(MARKS, MARKS.start, q),
    ascii: fromAddress(ASCII, ASCII.start, q),
    cel: fromAddress(CEL_DEF, CEL_DEF.start, q),
    blocks: fromAddress(BLOCKS_DEF, { ...BLOCKS_DEF.start, size: BLOCKS_DEF.start.size + (on.coarse ? 1 : 0) }, q),
    neon: fromAddress(NEON_DEF, NEON_DEF.start, q),
    glass: fromAddress(GLASS_DEF, GLASS_DEF.start, q),
    watercolor: fromAddress(WASH_DEF, WASH_DEF.start, q),
  }
}

/** Kept drawn settings read back over a start: `kept` is an object by style (`{ cel: {…}, blocks: {…} }`), any of it missing or unsound left as it starts. */
export function drawnFrom(start: DrawnSettings, kept: unknown): DrawnSettings {
  const got = (kept && typeof kept === 'object' ? kept : {}) as Record<string, unknown>
  return {
    marks: settingsFrom(MARKS, start.marks, got.marks),
    ascii: settingsFrom(ASCII, start.ascii, got.ascii),
    cel: settingsFrom(CEL_DEF, start.cel, got.cel),
    blocks: settingsFrom(BLOCKS_DEF, start.blocks, got.blocks),
    neon: settingsFrom(NEON_DEF, start.neon, got.neon),
    glass: settingsFrom(GLASS_DEF, start.glass, got.glass),
    watercolor: settingsFrom(WASH_DEF, start.watercolor, got.watercolor),
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

/** The settings a page shows for a style: those whose `when` holds, and no other page's trials. */
export function shownSettings<V>(def: StyleDef<V>, value: V, on: Shows, page?: string): Setting<V>[] {
  return def.settings.filter((s) => (!s.trial || s.trial === page) && (!s.when || s.when(value, on)))
}

