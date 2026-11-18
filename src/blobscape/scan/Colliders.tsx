import { useEffect, useRef, useState } from 'react'
import type { Orbit } from '../../splat-core/view.ts'
import { Button, Chip, Field, Slider, Toggle } from '../../shared/ui.tsx'
import { handlesOf, resized, wireOf, type Collider } from '../../splat-engine/colliders.ts'
import type { CreatureStage } from '../creature/stage.ts'

type Vec3 = [number, number, number]

/** What a shape is called on the page. */
export const SHAPE_NAMES: Record<Collider['shape'], string> = { box: 'Box', sphere: 'Ball', cylinder: 'Cylinder' }

/** Each shape's name in the list: its own if it has one, else its kind and its place among that kind. */
export function namesOf(colliders: readonly Collider[]): string[] {
  const seen: Record<string, number> = {}
  return colliders.map((c) => {
    const kind = SHAPE_NAMES[c.shape]
    seen[kind] = (seen[kind] ?? 0) + 1
    return c.name ? `${c.name[0].toUpperCase()}${c.name.slice(1)}` : `${kind} ${seen[kind]}`
  })
}

/** A new shape of a kind, a quarter the size of the box it is made in and standing on its floor. */
export function newCollider(shape: Collider['shape'], lo: ArrayLike<number>, hi: ArrayLike<number>): Collider {
  const r = Math.max(0.1, Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 8)
  const center: Vec3 = [(lo[0] + hi[0]) / 2, Math.max(lo[1], 0) + r, (lo[2] + hi[2]) / 2]
  return { shape, center, size: shape === 'box' ? [r, r, r] : shape === 'cylinder' ? [r, r, 0] : [r, 0, 0], turn: 0 }
}

/**
 * The shapes drawn over the view as lines, and the picked one's handles: a dot on each face that sizes it, and one in
 * its middle that slides it over the floor. Only the handles take the pointer, so the view under them still orbits.
 */
export function ColliderOverlay({ stage, orbit, colliders, picked, onChange }: {
  stage: CreatureStage
  orbit: Orbit
  colliders: readonly Collider[]
  picked: number
  onChange: (index: number, c: Collider, done: boolean) => void
}) {
  const svg = useRef<SVGSVGElement>(null)
  // drawn again when the view changes size: the lines are in its pixels
  const [, setSize] = useState(0)
  useEffect(() => {
    const el = svg.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setSize((n) => n + 1))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const grab = useRef<{ kind: 'size'; key: 0 | 1 | 2; from: Collider; x: number; y: number; per: [number, number] } | { kind: 'move'; from: Collider; dx: number; dz: number } | null>(null)
  const at = (p: ArrayLike<number>) => stage.screenAt(p, orbit)
  const local = (ev: { clientX: number; clientY: number }) => {
    const r = svg.current!.getBoundingClientRect()
    return { x: ev.clientX - r.left, y: ev.clientY - r.top }
  }
  /** Where the pointer's line of sight meets the level plane at a height. */
  const onLevel = (x: number, y: number, height: number): [number, number] | undefined => {
    const ray = stage.rayAt(x, y)
    if (!ray || Math.abs(ray.direction[1]) < 1e-4) return
    const t = (height - ray.origin[1]) / ray.direction[1]
    return t > 0 ? [ray.origin[0] + ray.direction[0] * t, ray.origin[2] + ray.direction[2] * t] : undefined
  }
  const c = colliders[picked]
  const handles = c ? handlesOf(c) : []
  return (
    <svg ref={svg} aria-hidden data-testid="scan-colliders" className="pointer-events-none absolute inset-0 h-full w-full">
      {colliders.map((shape, i) => {
        const runs = wireOf(shape).map((run) => run.map(at))
        const on = i === picked
        return (
          <g key={i} data-collider={i} data-picked={on || undefined}>
            {runs.map((run, k) => {
              if (run.some((p) => !p)) return null
              const points = run.map((p) => `${p!.x.toFixed(1)},${p!.y.toFixed(1)}`).join(' ')
              return (
                <g key={k}>
                  {/* a dark line under a light one, so it reads over any scan */}
                  <polyline points={points} fill={k === 0 ? (on ? 'rgba(242,85,58,0.16)' : 'rgba(255,255,255,0.08)') : 'none'} stroke="rgba(0,0,0,0.55)" strokeWidth={on ? 4 : 3} strokeLinejoin="round" />
                  <polyline points={points} fill="none" stroke={on ? '#ff8a70' : 'rgba(255,255,255,0.85)'} strokeWidth={on ? 2 : 1.25} strokeLinejoin="round" strokeDasharray={on ? undefined : '5 4'} />
                </g>
              )
            })}
          </g>
        )
      })}
      {c && (() => {
        const mid = at(c.center)
        return mid && (
          <circle
            data-handle="move" cx={mid.x} cy={mid.y} r={9} fill="#ff8a70" stroke="rgba(0,0,0,0.7)" strokeWidth={2}
            className="pointer-events-auto cursor-move touch-none"
            onPointerDown={(ev) => {
              ev.stopPropagation()
              ev.currentTarget.setPointerCapture(ev.pointerId)
              const p = local(ev), g = onLevel(p.x, p.y, c.center[1])
              grab.current = { kind: 'move', from: c, dx: g ? c.center[0] - g[0] : 0, dz: g ? c.center[2] - g[1] : 0 }
            }}
            onPointerMove={(ev) => {
              const g = grab.current
              if (g?.kind !== 'move') return
              const p = local(ev), to = onLevel(p.x, p.y, g.from.center[1])
              if (to) onChange(picked, { ...g.from, center: [to[0] + g.dx, g.from.center[1], to[1] + g.dz] }, false)
            }}
            onPointerUp={() => { if (grab.current) { grab.current = null; onChange(picked, colliders[picked], true) } }}
            onPointerCancel={() => { grab.current = null }}
          />
        )
      })()}
      {c && handles.map((h) => {
        const p = at(h.at), q = at([h.at[0] + h.axis[0] * 0.1, h.at[1] + h.axis[1] * 0.1, h.at[2] + h.axis[2] * 0.1])
        if (!p || !q) return null
        return (
          <circle
            key={h.key} data-handle={h.key} cx={p.x} cy={p.y} r={7} fill="#fff" stroke="rgba(0,0,0,0.7)" strokeWidth={2}
            className="pointer-events-auto cursor-grab touch-none active:cursor-grabbing"
            onPointerDown={(ev) => {
              ev.stopPropagation()
              ev.currentTarget.setPointerCapture(ev.pointerId)
              const s = local(ev)
              // pixels the handle moves on screen for one unit along its own way
              grab.current = { kind: 'size', key: h.key, from: c, x: s.x, y: s.y, per: [(q.x - p.x) / 0.1, (q.y - p.y) / 0.1] }
            }}
            onPointerMove={(ev) => {
              const g = grab.current
              if (g?.kind !== 'size') return
              const s = local(ev), len = g.per[0] * g.per[0] + g.per[1] * g.per[1]
              if (len < 1e-6) return
              onChange(picked, resized(g.from, g.key, ((s.x - g.x) * g.per[0] + (s.y - g.y) * g.per[1]) / len), false)
            }}
            onPointerUp={() => { if (grab.current) { grab.current = null; onChange(picked, colliders[picked], true) } }}
            onPointerCancel={() => { grab.current = null }}
          />
        )
      })}
    </svg>
  )
}

const cm = (v: number) => v.toFixed(2)

/** The Colliders tab: add shapes or guess them, pick one, and place, size, turn, copy or delete it. */
export function ColliderPanel({ colliders, picked, onPick, onSet, onGuess, show, onShow, lo, hi, onSave, onOpen, busy }: {
  colliders: readonly Collider[]
  picked: number
  onPick: (index: number) => void
  /** The whole list, changed, and which shape is picked after. */
  onSet: (next: Collider[], pick?: number) => void
  /** A first guess: the table and a box round what was kept. */
  onGuess: () => void
  show: boolean
  onShow: (v: boolean) => void
  /** The kept blobs' box, in the view's units: where new shapes go and how far the sliders reach. */
  lo: ArrayLike<number>
  hi: ArrayLike<number>
  onSave: () => void
  onOpen: (file: File) => void
  busy: boolean
}) {
  const names = namesOf(colliders)
  const c = colliders[picked]
  const reach = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 1)
  const change = (patch: Partial<Collider>) => onSet(colliders.map((x, i) => (i === picked ? { ...x, ...patch } : x)), picked)
  const moveTo = (k: number, v: number) => { const center: Vec3 = [c.center[0], c.center[1], c.center[2]]; center[k] = v; change({ center }) }
  const sizeTo = (k: number, v: number) => { const size: Vec3 = [c.size[0], c.size[1], c.size[2]]; size[k] = v / 2; change({ size }) }
  const add = (shape: Collider['shape']) => onSet([...colliders, newCollider(shape, lo, hi)], colliders.length)
  const file = useRef<HTMLInputElement>(null)
  const sizes: [number, string][] = !c ? [] : c.shape === 'box' ? [[0, 'Width'], [1, 'Height'], [2, 'Depth']] : c.shape === 'cylinder' ? [[0, 'Across'], [1, 'Height']] : [[0, 'Across']]
  return (
    <>
      <div className="grid gap-3">
        <p className="text-xs leading-relaxed text-ink-faint">A scan is only blobs: nothing in it is solid. Draw simple shapes over it and a creature has something to stand on.</p>
        <div className="flex flex-wrap gap-2" data-testid="scan-collider-add">
          <Button small onClick={() => add('box')}>Add a box</Button>
          <Button small onClick={() => add('sphere')}>Add a ball</Button>
          <Button small onClick={() => add('cylinder')}>Add a cylinder</Button>
          <Button small data-testid="scan-collider-guess" onClick={onGuess}>Guess from the scan</Button>
        </div>
        <Toggle label="Show the shapes" checked={show} onChange={onShow} />
      </div>
      {colliders.length > 0 && (
        <div className="grid gap-3">
          <Field label="Shapes">
            <div className="flex flex-wrap gap-1.5" data-testid="scan-collider-list">
              {names.map((n, i) => <Chip key={i} small active={i === picked} onClick={() => onPick(i === picked ? -1 : i)}>{n}</Chip>)}
            </div>
          </Field>
          {!c && <p className="text-xs text-ink-faint">Pick a shape here, or click it in the view, to place and size it.</p>}
          {c && (
            <>
              <Slider label="Left to right" value={c.center[0]} min={-reach} max={reach} step={0.01} onChange={(v) => moveTo(0, v)} format={cm} />
              <Slider label="Height" value={c.center[1]} min={-reach / 2} max={reach * 1.5} step={0.01} onChange={(v) => moveTo(1, v)} format={cm} hint="Where its middle is above the table." />
              <Slider label="Front to back" value={c.center[2]} min={-reach} max={reach} step={0.01} onChange={(v) => moveTo(2, v)} format={cm} />
              {sizes.map(([k, label]) => (
                <Slider key={label} label={k === 1 && c.shape !== 'sphere' ? 'Tall' : label} value={c.size[k] * 2} min={0.04} max={reach * 2.5} step={0.01} onChange={(v) => sizeTo(k, v)} format={cm} />
              ))}
              {c.shape === 'box' && <Slider label="Turn" value={c.turn} min={-180} max={180} step={1} onChange={(v) => change({ turn: v })} format={(v) => `${v}°`} />}
              <div className="flex flex-wrap gap-2">
                <Button small data-testid="scan-collider-copy" onClick={() => onSet([...colliders, { ...c, name: undefined, center: [c.center[0] + c.size[0], c.center[1], c.center[2]] }], colliders.length)}>Copy</Button>
                <Button small data-testid="scan-collider-delete" onClick={() => onSet(colliders.filter((_, i) => i !== picked), -1)}>Delete</Button>
              </div>
              <p className="text-xs text-ink-faint">In the view, drag the white dots to size it and the coral dot to slide it over the table.</p>
            </>
          )}
        </div>
      )}
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <Button small disabled={busy || !colliders.length} data-testid="scan-collider-save" onClick={onSave}>Save the shapes (.glb)</Button>
          <Button small disabled={busy} onClick={() => file.current?.click()}>Open shapes</Button>
          <input ref={file} type="file" accept=".glb" className="sr-only" tabIndex={-1} aria-label="Open a shapes .glb" data-testid="scan-collider-file" onChange={(ev) => { const f = ev.target.files?.[0]; ev.target.value = ''; if (f) onOpen(f) }} />
        </div>
        <p className="text-xs leading-relaxed text-ink-faint">The file holds the shapes where they sit round the saved scan, as plain boxes, balls and cylinders any 3D tool opens. Open in the sandbox takes them along, and creatures there stand on them.</p>
      </div>
    </>
  )
}
