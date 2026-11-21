import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { MarkLook } from '../splat-core/marks.ts'
import type { GlyphLook, GlyphSet } from '../splat-core/glyphs.ts'
import { gatherColors, type CelLook } from '../splat-core/cel.ts'
import type { Blobs } from '../splat-core/blobs.ts'
import { Button, Chip, Field, Slider, Toggle } from '../shared/ui.tsx'
import type { CreatureStage } from './creature/stage.ts'
import { GROUND, LOOKS, PAPERS, SCREEN, css, isMark, type LookId } from './brushLooks.ts'
import { NEON, NEON_GROUND, NEON_PACES, NEON_SETS, NEON_START, neonLook, type NeonChoice } from './neonLooks.ts'
import { GLASS, GLASS_FILLS, GLASS_GROUND, GLASS_START, glassLook, type GlassChoice } from './glassLooks.ts'
import { WASH, WASH_PAPERS, WASH_START, washGround, washLook, type WashChoice } from './washLooks.ts'
import { BLOCKS, BLOCK_GROUNDS, BLOCK_SIZES, BLOCK_START, SWELL_MOST, blockBack, blockLook, gridOf, type BlockChoice } from './blockLooks.ts'
import type { TimeOfDay } from './timeOfDay.ts'
import { BACKDROPS, CEL, CEL_START, FILL_REACH, celLook, nightLight, nightOf, type CelChoice } from './celLooks.ts'

/** Every drawn look a page can offer: the marks, ASCII, cel shading, neon, stained glass, watercolor, and the plain blobs. */
export type Look = LookId | typeof CEL.id | typeof BLOCKS.id | typeof NEON.id | typeof GLASS.id | typeof WASH.id
export const ALL_LOOKS: { id: Look; label: string; note: string }[] = [...LOOKS.slice(0, -1), CEL, BLOCKS, NEON, GLASS, WASH, LOOKS[LOOKS.length - 1]]
/** The looks that light the blobs themselves, and so want them built with no light baked in (`unlit`). */
export const wantsPlain = (look: Look | undefined) => look === 'cel' || look === 'neon' || look === 'glass' || look === 'blocks'

/** On the dark screen characters are thin lines of light and read fainter than their share of ink, so tones are raised by this. */
const SCREEN_GAIN = 1.5

/** The character sets of the ASCII look (`GlyphLook.set`); braille and blocks came from Silicon Jungle's Ink Studio. */
const CHAR_SETS: { id: GlyphSet; label: string; about: string }[] = [
  { id: 'ascii', label: 'ASCII', about: 'Letters and signs by how much there is to show, and strokes along edges.' },
  { id: 'braille', label: 'Braille', about: 'Eight dots a cell, each on where its eighth of the cell is heavy enough, so shapes come out finer than a character. Idea from Silicon Jungle\'s Ink Studio.' },
  { id: 'blocks', label: 'Blocks', about: 'Quarter blocks where a cell is half one thing and half another, and the shades ░ ▒ ▓ where it is even. Idea from Silicon Jungle\'s Ink Studio.' },
]

/** How many flat colors each part's own are gathered into for pixel art shaded a pixel at a time: the palette's ramps do the rest. */
export const PIXEL_FILLS = 3

const params = () => new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
const lum = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

/** What a page tells the looks about what is on its stage. */
export interface DrawnSubject {
  /** What is in the view, once it is: its colors are gathered into flat fills for cel shading. */
  actor?: { blobs: Blobs; partOf?: ArrayLike<number> }
  /** The side of a cell of the grid it was cut on, where it was cut on one: blocks are whole numbers of it. */
  spacing?: number
  /** Whether that was built with no light baked in (`unlit`), as cel shading needs. */
  plain: boolean
  /** The starting view's turn, which cel shading's light is measured from. */
  azimuth: number
  /** The subject's own sky, top and bottom (sRGB 0–255), where it has one: cel shading starts in front of it, and under a dark sky in a night's light. */
  sky?: readonly [readonly number[], readonly number[]]
  /** A phone or tablet: cel shading's cast shadows are drawn smaller and every other frame, which costs it less. */
  light?: boolean
  /** A scan: its marks are laid softly, one over another (`MarkLook.soft`). */
  soft?: boolean
  /** How many seconds the subject takes to come round again, where it loops: neon's pulses go a whole number of times into it. */
  loop?: number
  /** It has water that moves (an extra actor with `flows`): blocks offer it as blocks or as blobs. */
  water?: boolean
  /** It has weather laid over it (clouds, rain, snow): blocks offer it as blocks or as blobs. */
  weather?: boolean
  /** Frames are drawn only when asked for, so one must not depend on the one before. */
  offscreen: boolean
  /**
   * The time of day the page has set the subject in, where it has: the subject's `sky` is then that time's and the
   * stage's ambient light carries its light, so no look dims the scene for a dark sky a second time, and a look with a
   * sun of its own stands it at the time's height.
   */
  time?: TimeOfDay
  /** With no look (the page draws pixel art): cel shading's light for the picture the pixel art is made from, shaded a pixel at a time, with the subject's colors gathered into flat fills. */
  pixelCel?: CelLook
}

/**
 * One drawn look on a stage, with its settings: the marks, outlines, ASCII and cel shading of Brush and Ink, shared
 * with Diorama's Style tab. `look` undefined puts them all away (the page draws some other way, as pixel art).
 * Gives back the look's controls, each a section for a tab, and the color to put behind the transparent canvas.
 */
export function useDrawnLook(stage: CreatureStage | undefined, look: Look | undefined, on: DrawnSubject): { controls: ReactNode; ground: string | undefined; forget: () => void } {
  const [cel, setCel] = useState<CelChoice>(() => {
    const q = params(), n = (k: string, d: number) => (q.get(k) !== null && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : d)
    return { ...CEL_START, backdrop: '', turn: n('turn', CEL_START.turn), height: n('height', CEL_START.height), tones: q.get('tones') === '3' ? 3 : 2, shadows: q.get('shadows') !== '0', smooth: n('smooth', CEL_START.smooth), fills: Math.max(0, Math.min(4, Math.round(n('fills', CEL_START.fills)))) }
  })
  const [neon, setNeon] = useState<NeonChoice>(NEON_START)
  const [glass, setGlass] = useState<GlassChoice>(GLASS_START)
  const [wash, setWash] = useState<WashChoice>(WASH_START)
  // blocks: `?block=` is the size, in cells of the subject's grid; a phone starts a size up, for fewer cubes
  const [block, setBlock] = useState<BlockChoice>(() => {
    const v = Number(params().get('block')), swell = Number(params().get('swell'))
    // water and weather as blobs or as blocks (`?water=blocks`, `?falls=blocks`), and how high its ripples stand as blocks (`?swell=`)
    const back = params().get('backdrop') ?? ''
    // the subject's own sky or a plain color to stand in (`?backdrop=`)
    return { ...BLOCK_START, height: on.time?.height ?? BLOCK_START.height, backdrop: back === 'scene' || BLOCK_GROUNDS.some((g) => g.id === back) ? back : '', water: params().get('water') === 'blocks' ? 'blocks' : 'blobs', weather: params().get('falls') === 'blocks' ? 'blocks' : 'blobs', swell: params().get('swell') !== null && Number.isFinite(swell) ? Math.max(0, Math.min(SWELL_MOST, swell)) : BLOCK_START.swell, size: Number.isFinite(v) && v >= BLOCK_SIZES.min && v <= BLOCK_SIZES.max ? Math.round(v) : BLOCK_START.size + (on.light ? 1 : 0) }
  })
  // a time of day stands the blocks' sun at its own height; the slider moves it from there
  const timeId = on.time?.id, timeHeight = on.time?.height
  const [sunFor, setSunFor] = useState(timeId)
  if (sunFor !== timeId) { setSunFor(timeId); setBlock((c) => ({ ...c, height: timeHeight ?? BLOCK_START.height })) }
  const [size, setSize] = useState(1)
  // outlines: on for the two pen looks and cel shading unless the visitor says otherwise
  const [outlined, setOutlined] = useState<boolean | null>(() => (params().get('outline') === '1' ? true : params().get('outline') === '0' ? false : null))
  const [pen, setPen] = useState(1.5)
  const [paper, setPaper] = useState(PAPERS[0].id)
  // ASCII: how tall a character is, whether each takes the color of what it stands for, and strokes along edges
  const [letter, setLetter] = useState(12)
  const [own, setOwn] = useState(true)
  const [strokes, setStrokes] = useState(true)
  const [strands, setStrands] = useState(true)
  const [weight, setWeight] = useState(1)
  // which characters: ASCII, braille or blocks (`?chars=`)
  const [chars, setChars] = useState<GlyphSet>(() => (CHAR_SETS.find((c) => c.id === params().get('chars'))?.id ?? 'ascii'))
  const [copied, setCopied] = useState('')
  const { actor, plain, azimuth, soft, offscreen, sky, light, loop, spacing } = on
  // the subject's own sky is the first backdrop where it has one. Under a dark sky it is night: the shade and line are
  // the night's, and both tones are dimmed and cooled (`nightLight`), so the scene's lamps and lit windows stand out
  const skyDark = sky ? nightOf(sky) : 0
  const skyBack = sky ? { id: 'scene', label: "Scene's sky", back: `linear-gradient(${css(sky[0].map((v) => v / 255))}, ${css(sky[1].map((v) => v / 255))})`, like: skyDark > 0.5 ? 'night' : 'sky' } : undefined
  const backId = cel.backdrop || (skyBack ? 'scene' : CEL_START.backdrop)
  const inScene = backId === 'scene' && !!skyBack
  const celBase = inScene ? skyBack.like : backId
  const night = inScene ? skyDark : 0

  const sheet = PAPERS.find((p) => p.id === paper)!
  const marks = useMemo<MarkLook | undefined>(() => (look && look !== 'cel' && look !== 'blocks' && look !== 'neon' && look !== 'glass' && look !== 'watercolor' && isMark(look) ? { kind: look, size, ink: sheet.ink, paper: sheet.paper, soft } : undefined), [look, size, sheet, soft])
  useEffect(() => { stage?.setMarks(marks) }, [stage, marks, actor])
  const ascii = look === 'ascii'
  // off screen a frame is drawn only when asked for, and must not depend on the one before (`?steady=` says otherwise, for the checks)
  const held = useMemo(() => { const v = params().get('steady'); return v !== null && v !== '' && Number.isFinite(+v) ? +v : offscreen ? 0 : undefined }, [offscreen])
  const glyphs = useMemo<GlyphLook | undefined>(() => (ascii ? { size: letter, ink: own ? undefined : sheet.ink, light: !own && lum(sheet.paper) > lum(sheet.ink), edges: strokes, strands, gain: weight * (own ? SCREEN_GAIN : 1), steady: held, set: chars } : undefined), [ascii, letter, own, sheet, strokes, strands, weight, held, chars])
  useEffect(() => { stage?.setGlyphs(glyphs) }, [stage, glyphs])
  useEffect(() => { setCopied('') }, [look])
  const lit = look === 'neon'
  useEffect(() => {
    const still = !offscreen && typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    stage?.setNeon(lit ? neonLook(neon, loop, still) : undefined)
  }, [stage, lit, neon, loop, offscreen])
  const glazed = look === 'glass'
  // a sky's two colors are new arrays each time the page draws: the look follows their values
  const skyKey = sky ? sky.flat().join() : ''
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { stage?.setGlass(glazed ? glassLook(glass, sky) : undefined) }, [stage, glazed, glass, skyKey])
  const painted = look === 'watercolor'
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { stage?.setWash(painted ? washLook(wash, sky) : undefined) }, [stage, painted, wash, skyKey])
  const blocky = look === 'blocks'
  const blocksUp = useRef(false)
  // blocks stand in front of the subject's own sky, where it has one (a night's light under a dark one, unless the
  // page's time of day already dims the stage), or in front of a plain color
  const skyCss = skyBack?.back
  const blockBehind = useMemo(() => blockBack(block.backdrop, skyCss ? { back: skyCss, night: skyDark } : undefined, !!timeId), [block.backdrop, skyCss, skyDark, timeId])
  const blockTint = blockBehind.light
  useEffect(() => {
    if (!stage) return
    if (!blocky) { stage.setBlocks(); blocksUp.current = false; return }
    // while the subject is cut again the cubes on show stay: the stage makes them again for the next actor itself
    if (!actor || !plain) return
    const b = actor.blobs
    const set = () => { blocksUp.current = true; stage.setBlocks(blockLook(block, gridOf(spacing, b.center, b.count), azimuth, blockTint)) }
    // the first cubes go up at once, so no frame shows the bare blobs under them; a slider's changes wait a moment
    if (!blocksUp.current) { set(); return }
    const id = setTimeout(set, 120)
    return () => clearTimeout(id)
  }, [stage, blocky, actor, plain, block, spacing, azimuth, blockTint])
  useEffect(() => () => stage?.setBlocks(), [stage])
  const outline = !!look && !ascii && !lit && !glazed && !painted && !blocky && (outlined ?? (look === 'ink' || look === 'hatch' || look === 'stipple' || look === 'cel'))
  const { pixelCel } = on
  useEffect(() => { stage?.setCel(!look && pixelCel ? { ...pixelCel, ...(light ? { shadowSize: 1024, shadowEvery: offscreen ? 1 : 2 } : {}) } : look === 'cel' ? { ...celLook({ ...cel, backdrop: celBase, turn: cel.turn + azimuth, line: outline ? pen : 0 }), ambient: timeId ? undefined : nightLight(night), ...(light ? { shadowSize: 1024, shadowEvery: offscreen ? 1 : 2 } : {}) } : undefined) }, [stage, look, cel, celBase, night, timeId, outline, pen, azimuth, light, offscreen, pixelCel])
  // flat fills: each part's colors gathered into a few, shown in place of the blobs' own (which stay as they were)
  useEffect(() => {
    // stained glass wants them too: lead runs wherever the color changes, so a mottled surface would be all lead
    const fills = look === 'cel' ? cel.fills : look === 'glass' ? GLASS_FILLS : !look && pixelCel ? PIXEL_FILLS : 0
    if (!stage || !actor || !fills || !plain) return
    // speckle is anything finer than about two blobs across, by a typical blob's middle size (a strand of fur's width, not its length)
    const b = actor.blobs, sizes = Float32Array.from({ length: Math.min(b.count, 2000) }, (_, k) => { const i = Math.floor((k * b.count) / Math.min(b.count, 2000)); return [b.scale[i * 3], b.scale[i * 3 + 1], b.scale[i * 3 + 2]].sort((x, y) => x - y)[1] }).sort()
    const flat = gatherColors(b.color.subarray(0, b.count * 3), actor.partOf, fills, { at: b.center, reach: (sizes[sizes.length >> 1] || 0) * FILL_REACH })
    stage.tint((_own, i) => [flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2]])
    return () => stage.tint()
  }, [stage, actor, plain, look, cel.fills, !!pixelCel])
  useEffect(() => { stage?.setOutline(outline && look !== 'cel' ? { width: pen, ink: look === 'ink' || look === 'hatch' || look === 'stipple' ? sheet.ink : undefined } : undefined) }, [stage, outline, pen, look, sheet])

  const drawnOn = look === 'ink' || look === 'hatch' || look === 'stipple'
  // paint covers its ground, so a subject with a sky of its own stands in front of that
  const isPaint = look === 'gouache' || look === 'oil'
  const backdrop = BACKDROPS.find((b) => b.id === celBase) ?? BACKDROPS[0]
  const ground = !look || look === 'blobs' ? undefined : look === 'cel' ? (inScene ? skyBack.back : backdrop.back) : blocky ? blockBehind.back : lit ? NEON_GROUND : glazed ? GLASS_GROUND : painted ? washGround(wash) : ascii ? css(own ? SCREEN : sheet.paper) : drawnOn ? css(sheet.paper) : skyBack && isPaint ? skyBack.back : GROUND

  const controls = !look ? null : (
    <>
        {look === 'cel' && (
          <div className="space-y-4" data-testid="brush-cel">
            <Slider label="Light from" value={cel.turn} min={-180} max={180} step={5} onChange={(turn) => setCel((c) => ({ ...c, turn }))} format={(v) => `${v}°`} hint="Round the subject, from where the view starts: 0° is from the front, 90° from the right. The shadows go with it." />
            <Slider label="Light height" value={cel.height} min={10} max={85} step={1} onChange={(height) => setCel((c) => ({ ...c, height }))} format={(v) => `${v}°`} />
            <Field label="Tones">
              <div className="flex flex-wrap gap-1.5">
                <Chip active={cel.tones === 2} onClick={() => setCel((c) => ({ ...c, tones: 2 }))}>Light and shade</Chip>
                <Chip active={cel.tones === 3} onClick={() => setCel((c) => ({ ...c, tones: 3 }))}>Three tones</Chip>
              </div>
            </Field>
            <Toggle label="Cast shadows" checked={cel.shadows} onChange={(shadows) => setCel((c) => ({ ...c, shadows }))} />
            <Slider label="Shadow shapes" value={cel.smooth} min={1} max={12} step={0.5} onChange={(smooth) => setCel((c) => ({ ...c, smooth }))} format={(v) => `${v} px`} hint="How far the light is smoothed over a surface before it is cut into tones: more gives rounder, simpler shapes." />
            <Slider label="Colors in each part" value={cel.fills} min={0} max={4} step={1} onChange={(fills) => setCel((c) => ({ ...c, fills }))} format={(v) => (v === 0 ? 'As painted' : `${v}`)} hint="Each part's colors gathered into a few flat ones, so a mottled surface becomes areas of one color and a stripe stays a stripe." />
            <Field label="Backdrop">
              <div className="flex flex-wrap gap-1.5">
                {[...(skyBack ? [skyBack] : []), ...BACKDROPS].map((b) => <Chip key={b.id} active={backId === b.id} onClick={() => setCel((c) => ({ ...c, backdrop: b.id }))}>{b.label}</Chip>)}
              </div>
            </Field>
          </div>
        )}
        {blocky && (
          <div className="space-y-4" data-testid="brush-blocks">
            <Slider label="Block size" value={block.size} min={BLOCK_SIZES.min} max={BLOCK_SIZES.max} step={1} onChange={(size) => setBlock((c) => ({ ...c, size }))} format={(v) => `${v}×`} hint="How big a block is beside the grid the scene was cut on. Bigger blocks suit a big scene; a small creature loses its face." />
            <Slider label="Light from" value={block.turn} min={-180} max={180} step={5} onChange={(turn) => setBlock((c) => ({ ...c, turn }))} format={(v) => `${v}°`} hint="Round the subject, from where the view starts: 0° is from the front, 90° from the right. The shadows go with it." />
            <Slider label="Light height" value={block.height} min={10} max={85} step={1} onChange={(height) => setBlock((c) => ({ ...c, height }))} format={(v) => `${v}°`} />
            <Toggle label="Cast shadows" checked={block.shadows} onChange={(shadows) => setBlock((c) => ({ ...c, shadows }))} />
            <Slider label="Dark corners" value={block.corners} min={0} max={1} step={0.05} onChange={(corners) => setBlock((c) => ({ ...c, corners }))} format={(v) => `${Math.round(v * 100)}%`} hint="How much darker a face gets in a corner where blocks meet." />
            <Slider label="Block edges" value={block.edge} min={0} max={1} step={0.05} onChange={(edge) => setBlock((c) => ({ ...c, edge }))} format={(v) => (v === 0 ? 'None' : `${Math.round(v * 100)}%`)} hint="A thin line round each face, so blocks of one color still read as blocks." />
            <Slider label="Color varies" value={block.vary} min={0} max={1} step={0.05} onChange={(vary) => setBlock((c) => ({ ...c, vary }))} format={(v) => `${Math.round(v * 100)}%`} hint="How much one block's color differs from the next's." />
            {on.water && (
              <Field label="Water ripples">
                <div className="flex flex-wrap gap-1.5" data-testid="block-water">
                  <Chip active={block.water === 'blobs'} onClick={() => setBlock((c) => ({ ...c, water: 'blobs' }))}>As blobs</Chip>
                  <Chip active={block.water === 'blocks'} onClick={() => setBlock((c) => ({ ...c, water: 'blocks' }))}>As blocks</Chip>
                </div>
                <p className="mt-1.5 text-xs text-ink-faint">{block.water === 'blocks' ? 'The water is columns of blocks: each rises and falls in quarter steps of a block as the ripples pass.' : 'The water stays soft blobs among the cubes, as in the other styles.'}</p>
              </Field>
            )}
            {on.weather && (
              <Field label="Weather drawn as">
                <div className="flex flex-wrap gap-1.5" data-testid="block-weather">
                  <Chip active={block.weather === 'blobs'} onClick={() => setBlock((c) => ({ ...c, weather: 'blobs' }))}>Soft blobs</Chip>
                  <Chip active={block.weather === 'blocks'} onClick={() => setBlock((c) => ({ ...c, weather: 'blocks' }))}>Blocks</Chip>
                </div>
                <p className="mt-1.5 text-xs text-ink-faint">{block.weather === 'blocks' ? 'Clouds, rain and snow are cubes too: clouds in blocks of the scene\'s size, every drop and flake a small cube.' : 'Clouds, rain and snow stay soft blobs among the cubes, as in the other styles.'}</p>
              </Field>
            )}
            {on.water && block.water === 'blocks' && (
              <Slider label="Ripple height" value={block.swell} min={0} max={SWELL_MOST} step={1} onChange={(swell) => setBlock((c) => ({ ...c, swell }))} format={(v) => (v === 0 ? 'Flat' : `${v}×`)} hint="How many times higher than it really stands a ripple is built. Flat keeps the tops level, so only the color moves." />
            )}
            <Field label="Backdrop">
              <div className="flex flex-wrap gap-1.5" data-testid="block-backdrop">
                {skyBack && <Chip active={blockBehind.id === 'scene'} onClick={() => setBlock((c) => ({ ...c, backdrop: 'scene' }))}>{timeId ? 'Sky' : "Scene's own"}</Chip>}
                {BLOCK_GROUNDS.map((g) => <Chip key={g.id} active={blockBehind.id === g.id} onClick={() => setBlock((c) => ({ ...c, backdrop: g.id }))}>{g.label}</Chip>)}
              </div>
            </Field>
          </div>
        )}
        {lit && (
          <div className="space-y-4" data-testid="brush-neon">
            <Field label="Colors">
              <div className="flex flex-wrap gap-1.5">
                {NEON_SETS.map((s) => <Chip key={s.id} active={neon.set === s.id} onClick={() => setNeon((c) => ({ ...c, set: s.id }))}>{s.label}</Chip>)}
              </div>
              <p className="mt-1.5 text-xs text-ink-faint">Their own gives each tube the color of the thing it goes round, at full strength. The others deal a set of colors out part by part.</p>
            </Field>
            <Field label="Light runs">
              <div className="flex flex-wrap gap-1.5">
                {NEON_PACES.map((p) => <Chip key={p.id} active={neon.pace === p.id} onClick={() => setNeon((c) => ({ ...c, pace: p.id }))}>{p.label}</Chip>)}
              </div>
            </Field>
            <Slider label="Tube width" value={neon.line} min={1} max={5} step={0.5} onChange={(line) => setNeon((c) => ({ ...c, line }))} format={(v) => `${v} px`} />
            <Slider label="Glow" value={neon.glow} min={0} max={2} step={0.1} onChange={(glow) => setNeon((c) => ({ ...c, glow }))} format={(v) => `${Math.round(v * 100)}%`} hint="How far the tubes' light spills round them and onto the bodies beside them." />
            <Slider label="Bodies" value={neon.body} min={0} max={0.3} step={0.01} onChange={(body) => setNeon((c) => ({ ...c, body }))} format={(v) => `${Math.round(v * 100)}%`} hint="How much of its own color a body keeps where no tube's light reaches it." />
          </div>
        )}
        {glazed && (
          <div className="space-y-4" data-testid="brush-glass">
            <Slider label="Pane size" value={glass.pane} min={0.03} max={0.15} step={0.01} onChange={(pane) => setGlass((c) => ({ ...c, pane }))} format={(v) => `${Math.round(v * 100)}%`} hint="How big a pane is beside the whole scene. Panes are fixed in the scene, so they stay on their surfaces as the view turns." />
            <Slider label="Lead width" value={glass.lead} min={1} max={5} step={0.5} onChange={(lead) => setGlass((c) => ({ ...c, lead }))} format={(v) => `${v} px`} />
            <Slider label="Light behind" value={glass.shine} min={0} max={1} step={0.05} onChange={(shine) => setGlass((c) => ({ ...c, shine }))} format={(v) => `${Math.round(v * 100)}%`} hint="How much brighter the window is where the light stands behind it than at its corners." />
            <Slider label="Glass varies" value={glass.vary} min={0} max={1} step={0.05} onChange={(vary) => setGlass((c) => ({ ...c, vary }))} format={(v) => `${Math.round(v * 100)}%`} hint="How much one pane's glass differs from the next's." />
          </div>
        )}
        {painted && (
          <div className="space-y-4" data-testid="brush-wash">
            <Slider label="Edges run" value={wash.bleed} min={0} max={14} step={1} onChange={(bleed) => setWash((c) => ({ ...c, bleed }))} format={(v) => `${v} px`} hint="How far a wash's edge wanders over the paper." />
            <Slider label="Dark edges" value={wash.pool} min={0} max={1} step={0.05} onChange={(pool) => setWash((c) => ({ ...c, pool }))} format={(v) => `${Math.round(v * 100)}%`} hint="Paint pools where a wash ends or its color changes, and dries darker there." />
            <Slider label="Paper grain" value={wash.grain} min={0} max={1} step={0.05} onChange={(grain) => setWash((c) => ({ ...c, grain }))} format={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Paint strength" value={wash.strength} min={0.3} max={1} step={0.05} onChange={(strength) => setWash((c) => ({ ...c, strength }))} format={(v) => `${Math.round(v * 100)}%`} hint="Lower is paler, with more of the paper showing through." />
            <Slider label="Pencil" value={wash.pencil} min={0} max={1} step={0.05} onChange={(pencil) => setWash((c) => ({ ...c, pencil }))} format={(v) => (v === 0 ? 'None' : `${Math.round(v * 100)}%`)} hint="A pencil line under the paint, round each thing and between its parts." />
            <Field label="Paper">
              <div className="flex flex-wrap gap-1.5">
                {WASH_PAPERS.map((p) => <Chip key={p.id} active={wash.paper === p.id} onClick={() => setWash((c) => ({ ...c, paper: p.id }))}>{p.label}</Chip>)}
              </div>
            </Field>
          </div>
        )}
        {look !== 'cel' && !blocky && !lit && !glazed && !painted && isMark(look) && (
          <Slider label="Mark size" value={size} min={0.5} max={1.3} step={0.05} onChange={setSize} format={(v) => `${Math.round(v * 100)}%`} hint="Smaller marks leave gaps between them; bigger ones overlap more." />
        )}
        {ascii && (
          <Field label="Characters">
            <div className="flex flex-wrap gap-1.5" data-testid="brush-chars">
              {CHAR_SETS.map((c) => <Chip key={c.id} active={chars === c.id} onClick={() => setChars(c.id)}>{c.label}</Chip>)}
            </div>
            <p className="mt-1.5 text-xs text-ink-faint">{CHAR_SETS.find((c) => c.id === chars)!.about}</p>
          </Field>
        )}
        {ascii && (
          <Slider label="Character size" value={letter} min={8} max={24} step={2} onChange={setLetter} format={(v) => `${v} px`} hint="How tall a character is. Smaller ones show more of the picture; bigger ones are easier to read." />
        )}
        {ascii && (
          <Slider label="Weight" value={weight} min={0.5} max={2} step={0.1} onChange={setWeight} format={(v) => `${Math.round(v * 100)}%`} hint="Over 100% every cell takes a heavier character than its tone asks for, which suits a dim scene." />
        )}
        {ascii && chars === 'ascii' && (
          <div data-testid="brush-strokes">
            <Toggle label="Strokes along edges" checked={strokes} onChange={setStrokes} />
            <p className="mt-1.5 text-xs text-ink-faint">Where an edge runs through a cell it gets | _ / or \ by the way the edge runs, in place of a character for its tone.</p>
          </div>
        )}
        {ascii && chars === 'ascii' && (
          <div data-testid="brush-strands">
            <Toggle label="Strokes along fur and grass" checked={strands} onChange={setStrands} />
            <p className="mt-1.5 text-xs text-ink-faint">A cell that is mostly long thin blobs, such as strands of fur or blades of grass, gets the stroke nearest the way they run.</p>
          </div>
        )}
        {ascii && (
          <div data-testid="brush-own">
            <Toggle label="Their own colors" checked={own} onChange={setOwn} />
            <p className="mt-1.5 text-xs text-ink-faint">Each character takes the color of what it stands for, on a dark screen. Off, they are one ink on paper.</p>
          </div>
        )}
        {ascii && (
          <div>
            <Button small onClick={() => {
              void stage?.glyphText().then((text) => {
                if (!text) { setCopied('Nothing to copy yet.'); return }
                return navigator.clipboard.writeText(text).then(() => setCopied(`Copied ${text.split('\n').length} lines of text.`))
              }).catch(() => setCopied('This browser would not let the page copy.'))
            }}>Copy as text</Button>
            <p role="status" className="mt-1.5 text-xs text-ink-faint" data-testid="brush-copied">{copied || 'The picture as it stands now, in plain characters: paste it anywhere with a fixed-width font.'}</p>
          </div>
        )}
        {!ascii && !lit && !glazed && !painted && !blocky && (
          <div data-testid="brush-outline">
            <Toggle label="Outlines" checked={outline} onChange={setOutlined} />
            <p className="mt-1.5 text-xs text-ink-faint">{look === 'cel' ? 'An even line round the subject, where one thing stands in front of another, and between its parts.' : 'A pen line round the subject, where one thing stands in front of another, and between its parts. Heavier against dark things, and it lifts off here and there against light ones.'}</p>
          </div>
        )}
        {outline && (
          <Slider label="Pen width" value={pen} min={0.75} max={3} step={0.25} onChange={setPen} format={(v) => `${v} px`} />
        )}
        {(drawnOn || (ascii && !own)) && (
          <Field label="Paper">
            <div className="flex flex-wrap gap-1.5">
              {PAPERS.map((p) => <Chip key={p.id} active={paper === p.id} onClick={() => setPaper(p.id)}>{p.label}</Chip>)}
            </div>
          </Field>
        )}
    </>
  )
  return { controls, ground, forget: () => setCopied('') }
}

/**
 * A choice that waits for what it needs: `value` once `ready`, and until then the last value that was. A style that
 * wants its subject cut again (with no light baked in, or for another time of day) is drawn only when that cut is on
 * the stage, so the old picture stays up in its own style and the bare blobs never show between the two (Matt saw
 * them each time a scene was cut again, 2026-11-21).
 */
export function useHeld<T>(value: T, ready: boolean): T {
  const [held, setHeld] = useState(value)
  if (ready && held !== value) setHeld(value)
  return ready ? value : held
}
