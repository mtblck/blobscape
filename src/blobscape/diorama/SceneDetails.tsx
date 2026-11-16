import { useEffect, useRef, type ReactNode } from 'react'
import type { Rgb } from '../../splat-core/pixel.ts'

/**
 * Everything the page can count about the scene on show, as a panel of
 * readouts: what it is built from, the picture as drawn, and how the three
 * sizes (description, picture, splats) compare. A native modal dialog, so
 * the browser keeps focus inside it, closes it on Escape and hands focus
 * back to the button that opened it.
 */

export interface SceneFacts {
  name: string
  about: string
  blobs: number
  bones: number
  parts: number
  /** Only a scene written as data knows these two. */
  moves?: number
  descriptionBytes?: number
  lights: number
  loop: number
  splatBytes: number
  /** The detail level's name. */
  detail: string
  backend: 'webgpu' | 'webgl'
  /** The picture, when it is drawn as pixel art. */
  picture?: { width: number; height: number; scale: number; palette: Rgb[]; paletteName: string; motion: string; pngBytes?: number; used?: number }
}

export const kilobytes = (bytes: number) => `${(bytes / 1024).toLocaleString(undefined, { maximumFractionDigits: bytes < 10240 ? 1 : 0 })} KB`
const times = (a: number, b: number) => { const r = a / b; return r >= 10 ? Math.round(r).toLocaleString() : r.toFixed(1) }

type Tone = 'scene' | 'picture'
const TONE: Record<Tone, string> = { scene: 'var(--color-blob)', picture: 'var(--color-magic)' }

function Tile({ label, value, unit, note, tone }: { label: string; value: ReactNode; unit?: string; note?: ReactNode; tone: Tone }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-rule-soft bg-paper-sunk px-3 pt-3 pb-2.5">
      <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: TONE[tone] }} />
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-0.5">
        <span className="font-display text-2xl leading-tight text-ink tabular-nums">{value}</span>
        {unit && <span className="ml-1 text-xs text-ink-muted">{unit}</span>}
        {note && <span className="block text-xs text-ink-muted">{note}</span>}
      </dd>
    </div>
  )
}

function Group({ title, tone, children }: { title: string; tone: Tone; children: ReactNode }) {
  return (
    <section>
      <h3 className="flex items-center gap-2 font-display text-base text-ink">
        <span aria-hidden className="size-2.5 rounded-full" style={{ background: TONE[tone] }} />{title}
      </h3>
      <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{children}</dl>
    </section>
  )
}

export function SceneDetails({ open, onClose, facts }: { open: boolean; onClose: () => void; facts: SceneFacts }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  const p = facts.picture
  // the three sizes on one scale: each step along is ten times bigger, or a KB would not show beside megabytes
  const sizes = [
    ...(facts.descriptionBytes ? [{ label: 'Description', hint: 'the scene written as data', bytes: facts.descriptionBytes, color: 'var(--color-done)' }] : []),
    ...(p?.pngBytes ? [{ label: 'Picture', hint: 'this frame as a PNG', bytes: p.pngBytes, color: TONE.picture }] : []),
    { label: 'Splats', hint: 'every blob in memory', bytes: facts.splatBytes, color: TONE.scene },
  ]
  const top = Math.log10(Math.max(...sizes.map((s) => s.bytes)))
  const width = (bytes: number) => `${Math.max(4, (100 * (Math.log10(bytes) - 2)) / (top - 2))}%`
  return (
    <dialog
      ref={ref}
      aria-labelledby="scene-details-title"
      data-testid="diorama-details"
      onClose={onClose}
      // a click on the dimmed page behind closes it: the dialog itself is the only thing a click there lands on
      onClick={(e) => { if (e.target === ref.current) onClose() }}
      className="m-auto max-h-[88svh] w-[min(100%-1.5rem,42rem)] overflow-y-auto rounded-2xl border border-rule bg-paper p-0 text-ink shadow-2xl backdrop:bg-black/60"
    >
      <div className="grid gap-5 p-4 sm:p-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs tracking-wide text-ink-muted uppercase">Scene details</p>
            <h2 id="scene-details-title" className="font-display text-2xl leading-tight sm:text-3xl">{facts.name}</h2>
            <p className="mt-1 text-sm text-ink-muted">{facts.about}.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close scene details" className="grid size-9 flex-none cursor-pointer place-items-center rounded-full border border-rule text-ink hover:bg-paper-sunk">
            <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>

        <section aria-labelledby="scene-sizes-title" className="rounded-xl bg-deep p-4 text-white">
          <h3 id="scene-sizes-title" className="font-display text-base">How big it is</h3>
          <ul className="mt-3 grid gap-2.5">
            {sizes.map((s) => (
              <li key={s.label} className="grid grid-cols-[6.5rem_1fr] items-center gap-x-3 sm:grid-cols-[7.5rem_1fr]">
                <span className="text-sm">{s.label}<span className="block text-xs text-white/70">{s.hint}</span></span>
                <span className="flex items-center gap-2">
                  <span aria-hidden className="h-4 rounded-full" style={{ width: width(s.bytes), background: s.color, maxWidth: 'calc(100% - 5.5rem)' }} />
                  <span className="font-display text-lg whitespace-nowrap tabular-nums" data-testid={`details-${s.label.toLowerCase()}`}>{kilobytes(s.bytes)}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-white/75">
            {facts.descriptionBytes ? <>The splats are {times(facts.splatBytes, facts.descriptionBytes)} times the size of the description they are built from. </> : ''}
            {p?.pngBytes ? <>A frame of the picture is {times(facts.splatBytes, p.pngBytes)} times smaller than the splats it is drawn from. </> : ''}
            Each step along a bar is ten times bigger.
          </p>
        </section>

        <Group title="The scene" tone="scene">
          <Tile tone="scene" label="Blobs" value={facts.blobs.toLocaleString()} note={`${facts.detail} detail`} />
          <Tile tone="scene" label="Bones" value={facts.bones} note="one for the land, the rest move" />
          <Tile tone="scene" label="Parts" value={facts.parts} note="shapes it is cut from" />
          {facts.moves !== undefined && <Tile tone="scene" label="Moves" value={facts.moves} note="sways, spins and flickers" />}
          <Tile tone="scene" label="Live lights" value={facts.lights} note="lit afresh each frame" />
          <Tile tone="scene" label="Loop" value={facts.loop} unit="seconds" note="then it repeats" />
        </Group>

        {p ? (
          <Group title="The picture" tone="picture">
            <Tile tone="picture" label="Resolution" value={<>{p.width}&thinsp;×&thinsp;{p.height}</>} note={`${(p.width * p.height).toLocaleString()} pixels`} />
            <Tile tone="picture" label="Pixel size" value={<>×{p.scale}</>} note="screen pixels per art pixel" />
            <Tile tone="picture" label="Colors" value={p.palette.length || 'Full'} note={p.palette.length ? (p.used ? `${p.used} in this frame` : p.paletteName) : 'no palette'} />
            <Tile tone="picture" label="Motion" value={p.motion} note="how often the pose moves" />
          </Group>
        ) : <p className="text-sm text-ink-muted">Drawn as blobs at full size. Switch to Pixel art for the picture's numbers.</p>}

        {p && p.palette.length > 0 && (
          <section aria-labelledby="scene-palette-title">
            <h3 id="scene-palette-title" className="font-display text-base text-ink">Palette <span className="font-sans text-xs font-normal text-ink-muted">{p.paletteName}, {p.palette.length} colors</span></h3>
            <div role="img" aria-label={`The ${p.palette.length} colors of the palette`} className="mt-2 flex h-9 overflow-hidden rounded-lg border border-rule-soft">
              {p.palette.map((c, i) => <span key={i} className="flex-1" style={{ background: `rgb(${c[0]} ${c[1]} ${c[2]})` }} />)}
            </div>
          </section>
        )}

        <p className="text-xs text-ink-muted">Drawn by the Blobscape engine on {facts.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2'}. The numbers follow the options you pick.</p>
      </div>
    </dialog>
  )
}
