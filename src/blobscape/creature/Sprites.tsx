import { useEffect, useRef, useState } from 'react'
import type { Clip } from '../../splat-engine/glb.ts'
import type { BakedSheet } from '../../splat-engine/bakeSheet.ts'
import { asepriteJson, planSheet, tinkerkitJson, type SheetMove } from '../../splat-engine/spriteSheet.ts'
import { Button, Chip, Field, Toggle } from '../../shared/ui.tsx'
import { download, kb } from '../files.ts'
import { CARD, CARD_SUB, CARD_TITLE } from './card.ts'
import type { CreatureStage } from './stage.ts'

/** Picks are clip positions (a file may have two clips of one name, or one called "still"), plus this for the rest pose. */
const STILL = -1
const SIZES = [32, 48, 64, 96]
const FRAMES = [6, 8, 12]
const COLORS = [8, 16, 32]

interface Settings { moves: number[]; directions: 4 | 8; size: number; frames: number; colors: number; outline: boolean }

/** For verify: the same settings, with moves by clip name ('still' for the rest pose). */
export type SheetRequest = Omit<Settings, 'moves'> & { moves: string[] }

/**
 * Turns the picks into the baker's moves: chosen clips in the creature's own
 * order, then the still pose, each with a name no other move has (they name
 * the animations in the files).
 */
export function sheetMoves(clips: Clip[], chosen: number[], frames: number): SheetMove[] {
  const moves: SheetMove[] = clips.flatMap((c, k) => (chosen.includes(k) ? [{ name: c.name, clip: c, frames }] : []))
  if (chosen.includes(STILL)) moves.push({ name: 'still', frames: 1 })
  const seen = new Map<string, number>()
  for (const m of moves) {
    const key = slug(m.name)
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)
    if (n > 1) m.name = `${m.name}-${n}`
  }
  return moves
}

/** How many sides the sheet was drawn from: the rows of its first move. */
const sides = (m: Made) => m.sheet.plan.rows.filter((r) => r.move === m.sheet.plan.rows[0].move).length

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sprite'

interface Made { sheet: BakedSheet; url: string; png: Blob; name: string; file: string; settings: string }

/**
 * Splat Creatures' sprite sheets: the creature on show, the moves you pick,
 * from 4 or 8 sides, as pixel art in one PNG with a Tinkerkit sheet and an
 * Aseprite-style JSON beside it. Drawn on the page's own renderer, with the
 * live view paused while it works.
 */
export function Sprites({ stage, name, clips, labelOf, current }: { stage?: CreatureStage; name: string; clips: Clip[]; labelOf: (c: Clip) => string; current?: Clip }) {
  const startPick = () => [current ? clips.indexOf(current) : STILL]
  const [chosen, setChosen] = useState<number[]>(startPick)
  const [directions, setDirections] = useState<4 | 8>(4)
  const [size, setSize] = useState(48)
  const [frames, setFrames] = useState(8)
  const [colors, setColors] = useState(16)
  const [outline, setOutline] = useState(true)
  /** Announced: drawing started, the sheet is ready. */
  const [note, setNote] = useState('')
  const [error, setError] = useState<string>()
  /** Not announced: frame by frame. */
  const [progress, setProgress] = useState<string>()
  const [made, setMade] = useState<Made>()
  // A sheet that finishes after the creature changed is for a creature no longer on show
  const generation = useRef(0)

  // A different creature: start from what it's doing, and drop the old sheet
  useEffect(() => {
    generation.current++
    setChosen(startPick())
    setMade(undefined)
    setNote('')
    setError(undefined)
  }, [clips]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (made) URL.revokeObjectURL(made.url) }, [made])

  const toggle = (id: number) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))
  const settings: Settings = { moves: [...chosen].sort((a, b) => a - b), directions, size, frames, colors, outline }
  const moves = sheetMoves(clips, chosen, frames)
  const plan = planSheet(moves, directions)
  const count = moves.reduce((s, m) => s + m.frames, 0) * directions
  const drawing = progress !== undefined
  const stale = !!made && made.settings !== JSON.stringify(settings)

  const make = async (over?: Partial<Settings>) => {
    if (!stage || drawing) return undefined
    const r = { ...settings, ...over }
    const ms = sheetMoves(clips, r.moves, r.frames)
    if (!ms.length) return undefined
    const gen = generation.current
    const total = ms.reduce((s, m) => s + m.frames, 0) * r.directions
    setError(undefined)
    setNote(`Drawing ${total} frames…`)
    setProgress('Drawing…')
    try {
      const sheet = await stage.bake(ms, { directions: r.directions, size: r.size, colors: r.colors, outline: r.outline }, (d, t) => setProgress(`Drawing frame ${d} of ${t}…`))
      if (gen !== generation.current) { setNote(''); return undefined }
      const png = await sheet.png()
      if (gen !== generation.current) { setNote(''); return undefined }
      setMade({ sheet, png, url: URL.createObjectURL(png), name, file: slug(name), settings: JSON.stringify({ ...r, moves: [...r.moves].sort((a, b) => a - b) }) })
      setNote(`Sheet ready: ${sheet.frames.length} frames.`)
      return sheet
    } catch (e) {
      setNote('')
      setError(`Couldn't draw the sheet: ${e instanceof Error ? e.message : String(e)}`)
      return undefined
    } finally {
      setProgress(undefined)
    }
  }

  // For verify: draw a sheet without clicking
  useEffect(() => {
    window.__sprites = async (req) => {
      const over: Partial<Settings> = { ...req, moves: req?.moves?.map((n) => (n === 'still' ? STILL : clips.findIndex((c) => c.name === n))) }
      if (!req?.moves) delete over.moves
      const s = await make(over)
      if (!s) throw new Error('no sheet')
      return { cols: s.plan.cols, rows: s.plan.rows.length, size: s.size, anchorY: s.anchorY, solid: s.frames.map((f) => { let k = 0; for (let i = 3; i < f.data.length; i += 4) if (f.data[i]) k++; return k }) }
    }
    return () => { delete window.__sprites }
  })

  const save = async (what: 'png' | 'tinkerkit' | 'aseprite') => {
    if (!made) return
    const image = `${made.file}.png`
    if (what === 'png') download(new Uint8Array(await made.png.arrayBuffer()), image, 'image/png')
    else {
      const json = what === 'tinkerkit'
        ? tinkerkitJson(made.name, image, made.sheet.plan, made.sheet.size, made.sheet.anchorY)
        : asepriteJson(image, made.sheet.plan, made.sheet.size)
      download(new TextEncoder().encode(JSON.stringify(json, null, 2)), `${made.file}${what === 'tinkerkit' ? '.sheet' : ''}.json`, 'application/json')
    }
  }

  const w = plan.cols * size, h = plan.rows.length * size
  return (
    <section aria-labelledby="sprites-title" className={CARD} data-testid="sprites">
      <h2 id="sprites-title" className={CARD_TITLE}>Sprite sheet <small className={CARD_SUB}>pixel art for 2D games</small></h2>
      <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
        <div className="stack-controls grid content-start items-start gap-x-6 gap-y-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Moves">
            <div className="flex flex-wrap gap-1.5">
              {clips.map((c, k) => <Chip key={`${k}-${c.name}`} active={chosen.includes(k)} onClick={() => toggle(k)}>{labelOf(c)}</Chip>)}
              <Chip active={chosen.includes(STILL)} onClick={() => toggle(STILL)}>Still</Chip>
            </div>
          </Field></div>
          <Field label="Directions">
            <div className="flex flex-wrap gap-1.5">
              <Chip active={directions === 4} onClick={() => setDirections(4)}>4</Chip>
              <Chip active={directions === 8} onClick={() => setDirections(8)}>8</Chip>
            </div>
          </Field>
          <Field label="Frames per move">
            <div className="flex flex-wrap gap-1.5">{FRAMES.map((n) => <Chip key={n} active={frames === n} onClick={() => setFrames(n)}>{n}</Chip>)}</div>
          </Field>
          <Field label="Size">
            <div className="flex flex-wrap gap-1.5">{SIZES.map((n) => <Chip key={n} active={size === n} onClick={() => setSize(n)}>{n} px</Chip>)}</div>
          </Field>
          <Field label="Colors">
            <div className="flex flex-wrap gap-1.5">{COLORS.map((n) => <Chip key={n} active={colors === n} onClick={() => setColors(n)}>{n}</Chip>)}</div>
          </Field>
          <Field label="Edges">
            <Toggle label="Dark outline" checked={outline} onChange={setOutline} />
          </Field>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button primary disabled={!stage || !moves.length || drawing} onClick={() => void make()}>{made ? 'Draw again' : 'Draw the sheet'}</Button>
            <p className="text-xs text-ink-faint">
              {moves.length ? <>{count} frames, {w} × {h} px</> : 'Pick at least one move.'}
            </p>
          </div>
          <p aria-hidden className="text-xs text-ink-faint tabular-nums sm:col-span-2 empty:hidden">{progress ?? ''}</p>
          <p className="text-xs leading-relaxed text-ink-faint sm:col-span-2">Every frame is the same creature from the same distance, so nothing wobbles between frames or sides.</p>
          <p aria-live="polite" className="sr-only" data-testid="sprites-note">{note}</p>
          {error && <p role="alert" className="text-sm text-ink sm:col-span-2">{error}</p>}
        </div>
        <div className="min-w-0">
          {made ? (
            <div className="grid gap-3">
              {stale && <p className="text-xs text-ink-muted">This sheet is from your earlier choices. Press Draw again to match them.</p>}
              <div tabIndex={0} role="region" aria-label="Sheet preview, scrolls" className="case max-h-[28rem] overflow-auto rounded-xl bg-[#0d0f16] p-3 ring-1 ring-rule outline-none focus-visible:ring-2 focus-visible:ring-accent">
                <img
                  src={made.url}
                  alt={`Pixel-art sprite sheet of the ${made.name}: ${made.sheet.plan.rows.length} rows of up to ${made.sheet.plan.cols} frames`}
                  width={made.sheet.plan.cols * made.sheet.size}
                  height={made.sheet.plan.rows.length * made.sheet.size}
                  className="h-auto max-w-none [image-rendering:pixelated]"
                  style={{ width: Math.min(2, 640 / (made.sheet.plan.cols * made.sheet.size)) * made.sheet.plan.cols * made.sheet.size }}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button small onClick={() => void save('png')}>Download PNG ({kb(made.png.size)})</Button>
                <Button small onClick={() => void save('tinkerkit')}>Tinkerkit sheet</Button>
                <Button small onClick={() => void save('aseprite')}>JSON for Aseprite, Phaser…</Button>
              </div>
              <p className="text-xs text-ink-faint">
                Rows go move by move; each move has a row per side ({sides(made) === 8 ? 'clockwise from facing you' : 'down, left, right, up'}).
                Animations are named like <code>{`${slug(made.sheet.plan.rows[0].move.name)}-${made.sheet.plan.rows[0].dir}`}</code>.
              </p>
            </div>
          ) : (
            <div className="grid h-full min-h-40 place-items-center rounded-xl border border-dashed border-rule px-4 text-center text-sm text-ink-faint">
              {progress ?? 'Pick moves and press Draw the sheet. It takes a few seconds.'}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

declare global {
  interface Window { __sprites?: (req?: Partial<SheetRequest>) => Promise<{ cols: number; rows: number; size: number; anchorY: number; solid: number[] }> }
}
