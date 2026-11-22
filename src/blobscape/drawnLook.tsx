import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { lightsItself } from './diorama/styles.ts'
import type { MarkLook } from '../splat-core/marks.ts'
import type { GlyphLook } from '../splat-core/glyphs.ts'
import { gatherColors, type CelLook } from '../splat-core/cel.ts'
import type { Blobs } from '../splat-core/blobs.ts'
import { Button } from '../shared/ui.tsx'
import type { CreatureStage } from './creature/stage.ts'
import { GROUND, LOOKS, PAPERS, SCREEN, css, isMark, type LookId } from './brushLooks.ts'
import { NEON, NEON_GROUND, neonLook } from './neonLooks.ts'
import { GLASS, GLASS_FILLS, GLASS_GROUND, glassLook } from './glassLooks.ts'
import { WASH, washGround, washLook } from './washLooks.ts'
import { BLOCKS, BLOCK_GROUNDS, blockBack, blockLook, gridOf } from './blockLooks.ts'
import type { TimeOfDay } from './timeOfDay.ts'
import { ASCII, BLOCKS_DEF, CEL_DEF, GLASS_DEF, MARKS, NEON_DEF, WASH_DEF, drawnStart, type DrawnSettings, type Shows } from './styles/catalog.ts'
import { SettingsControls } from './styles/SettingsControls.tsx'
import { BACKDROPS, CEL, CEL_START, FILL_REACH, celLook, nightLight, nightOf } from './celLooks.ts'

/** Every drawn look a page can offer: the marks, ASCII, cel shading, neon, stained glass, watercolor, and the plain blobs. */
export type Look = LookId | typeof CEL.id | typeof BLOCKS.id | typeof NEON.id | typeof GLASS.id | typeof WASH.id
export const ALL_LOOKS: { id: Look; label: string; note: string }[] = [...LOOKS.slice(0, -1), CEL, BLOCKS, NEON, GLASS, WASH, LOOKS[LOOKS.length - 1]]
/** The looks that light the blobs themselves, and so want them built with no light baked in (`unlit`). */
export const wantsPlain = (look: Look | undefined) => lightsItself(look)

/** On the dark screen characters are thin lines of light and read fainter than their share of ink, so tones are raised by this. */
const SCREEN_GAIN = 1.5

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
  /** The page has a backdrop of its own behind the canvas: cel shading takes the shade and line of this one of its backdrops and offers no choice of them. */
  backdrop?: string
  /** With no look (the page draws pixel art): cel shading's light for the picture the pixel art is made from, shaded a pixel at a time, with the subject's colors gathered into flat fills. */
  pixelCel?: CelLook
}

/**
 * One drawn look on a stage, with its settings: the marks, outlines, ASCII and cel shading of Brush and Ink, shared
 * with Diorama's Style tab. `look` undefined puts them all away (the page draws some other way, as pixel art).
 * Gives back the look's controls, each a section for a tab, and the color to put behind the transparent canvas.
 */
export function useDrawnLook(stage: CreatureStage | undefined, look: Look | undefined, on: DrawnSubject, kept?: readonly [DrawnSettings, Dispatch<SetStateAction<DrawnSettings>>]): { controls: ReactNode; ground: string | undefined; forget: () => void } {
  // the settings are the page's to hold (so its saved scenes and links keep them) or, where it holds none, this hook's
  const mine = useState<DrawnSettings>(() => drawnStart(params(), { coarse: on.light }))
  const [drawn, setDrawn] = kept ?? mine
  const { cel, neon, glass, watercolor: wash, blocks: block, marks: mk, ascii: asc } = drawn
  const change = <K extends keyof DrawnSettings>(key: K) => (c: Partial<DrawnSettings[K]>) => setDrawn((d) => ({ ...d, [key]: { ...d[key], ...c } }))
  // a time of day stands the blocks' sun at its own height; the slider moves it from there
  const timeId = on.time?.id, timeHeight = on.time?.height
  const [sunFor, setSunFor] = useState<string | undefined>(undefined)
  if (sunFor !== timeId) { setSunFor(timeId); if (timeId || sunFor) change('blocks')({ height: timeHeight ?? BLOCKS_DEF.start.height }) }
  const size = mk.size
  // outlines: on for the two pen looks and cel shading unless the visitor says otherwise
  const outlined = look === 'cel' ? cel.outline : mk.outline
  const pen = look === 'cel' ? cel.pen : mk.pen
  const paper = look === 'ascii' ? asc.paper : mk.paper
  // ASCII: how tall a character is, whether each takes the color of what it stands for, and strokes along edges
  const { letter, own, strokes, strands, weight, chars } = asc
  const [copied, setCopied] = useState('')
  const { actor, plain, azimuth, soft, offscreen, sky, light, loop, spacing } = on
  // the subject's own sky is the first backdrop where it has one. Under a dark sky it is night: the shade and line are
  // the night's, and both tones are dimmed and cooled (`nightLight`), so the scene's lamps and lit windows stand out
  const skyDark = sky ? nightOf(sky) : 0
  const skyBack = sky ? { id: 'scene', label: "Scene's sky", back: `linear-gradient(${css(sky[0].map((v) => v / 255))}, ${css(sky[1].map((v) => v / 255))})`, like: skyDark > 0.5 ? 'night' : 'sky' } : undefined
  const backId = on.backdrop ?? (cel.backdrop || (skyBack ? 'scene' : CEL_START.backdrop))
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

  const shows: Shows = { style: look ?? 'blobs', water: on.water, weather: on.weather }
  const controls = !look ? null : (
    <>
        {look === 'cel' && (
          <div className="space-y-4" data-testid="brush-cel">
            <SettingsControls def={CEL_DEF} value={cel} onChange={change('cel')} on={shows} skip={on.backdrop ? ['backdrop'] : undefined} choices={{ backdrop: { options: [...(skyBack ? [skyBack] : []), ...BACKDROPS], active: backId } }} />
          </div>
        )}
        {blocky && (
          <div className="space-y-4" data-testid="brush-blocks">
            <SettingsControls def={BLOCKS_DEF} value={block} onChange={change('blocks')} on={shows} choices={{ backdrop: { options: [...(skyBack ? [{ id: 'scene', label: timeId ? 'Sky' : "Scene's own" }] : []), ...BLOCK_GROUNDS], active: blockBehind.id } }} />
          </div>
        )}
        {lit && (
          <div className="space-y-4" data-testid="brush-neon">
            <SettingsControls def={NEON_DEF} value={neon} onChange={change('neon')} on={shows} />
          </div>
        )}
        {glazed && (
          <div className="space-y-4" data-testid="brush-glass">
            <SettingsControls def={GLASS_DEF} value={glass} onChange={change('glass')} on={shows} />
          </div>
        )}
        {painted && (
          <div className="space-y-4" data-testid="brush-wash">
            <SettingsControls def={WASH_DEF} value={wash} onChange={change('watercolor')} on={shows} />
          </div>
        )}
        {look !== 'cel' && !blocky && !lit && !glazed && !painted && !ascii && <SettingsControls def={MARKS} value={mk} onChange={change('marks')} on={shows} />}
        {ascii && <SettingsControls def={ASCII} value={asc} onChange={change('ascii')} on={shows} />}
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
