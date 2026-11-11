import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Blobs, hexToRgb, pick, quatFacing, quatToMat, type Lens, type Vec3 } from '../splat-core/blobs.ts'
import type { Orbit, SplatView } from '../splat-core/view.ts'
import { PRESETS } from '../splat-core/presets.ts'
import { blobsFromPreset, blobsFromSamples, sampleShape } from '../splat-core/shapes.ts'
import { Button, Chip, Field, Panel, Slider, Tabs, Toggle } from '../shared/ui.tsx'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { Viewport, type ToolHandlers } from './Viewport.tsx'
import { drawCentres, drawOutlines, themeColour, toScreen } from './overlay.ts'
import { History } from './history.ts'
import { takeHandOff } from './handoff.ts'

type ToolId = 'orbit' | 'add' | 'spray' | 'select' | 'erase'
const TOOLS: { id: ToolId; name: string; note: string }[] = [
  { id: 'orbit', name: 'Look', note: 'Drag to orbit, scroll or pinch to zoom. With a mouse, right-drag (or Alt-drag) orbits whatever tool is picked.' },
  { id: 'add', name: 'Add', note: 'Click to place one blob, on the floor or on the surface of whatever you click.' },
  { id: 'spray', name: 'Spray', note: 'Drag to spray blobs inside the ring. They stick to whatever is under them, so you can build up layers.' },
  { id: 'select', name: 'Select', note: 'Click a blob to select it; Shift-click adds to the selection. Then change it in the Selection tab.' },
  { id: 'erase', name: 'Erase', note: 'Drag to remove every blob whose centre is inside the ring.' },
]

const STARTS = [
  ...PRESETS.map((p) => ({ id: p.id, name: p.name, make: () => blobsFromPreset(p) })),
  { id: 'sphere', name: 'Sphere', make: () => blobsFromSamples(sampleShape('sphere', 2500), 0.035, true) },
  { id: 'empty', name: 'Empty', make: () => new Blobs() },
]

const SWATCHES = ['#e5484d', '#f2a65a', '#f5d90a', '#30a46c', '#3e9be0', '#8e4ec6', '#f4ede1', '#2b2620']
const OUTLINE_LIMIT = 1500
const MAX_BLOBS = 200000

/** Centre and size of a scene, for pointing the camera at it. */
function frame(b: Blobs): Pick<Orbit, 'target' | 'distance'> {
  if (!b.count) return { target: [0, 0.5, 0], distance: 4 }
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  const stride = Math.max(1, Math.floor(b.count / 20000))
  for (let i = 0; i < b.count; i += stride) for (let a = 0; a < 3; a++) {
    lo[a] = Math.min(lo[a], b.centre[i * 3 + a]); hi[a] = Math.max(hi[a], b.centre[i * 3 + a])
  }
  const r = Math.max(0.3, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2)
  return { target: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], distance: r * 3.2 }
}

export function Sandbox() {
  const h1 = useFocusHeading()
  const [handed] = useState(takeHandOff)
  // Built once: a useRef argument would be rebuilt (and thrown away) on every render
  const [initial] = useState(() => handed?.blobs ?? STARTS[0].make())
  const blobsRef = useRef<Blobs>(initial)
  const [version, setVersion] = useState(0)
  // The first blob index changed since the last sync, so a spray stroke only uploads its new blobs
  const syncFrom = useRef(0)
  const bump = useCallback((from = 0) => {
    syncFrom.current = Math.min(syncFrom.current, from)
    setVersion((v) => v + 1)
  }, [])
  const takeSyncFrom = useCallback(() => { const f = syncFrom.current; syncFrom.current = Infinity; return f }, [])
  const [source, setSource] = useState(handed ? handed.name : STARTS[0].name)
  const [orbit, setOrbit] = useState<Orbit>(() => ({ ...frame(blobsRef.current), azimuth: 30, elevation: 22 }))
  const [view, setView] = useState<SplatView | null>(null)
  const history = useRef(new History())

  // On a touchscreen one finger can't both orbit and paint, so start in Look there
  const coarse = useMemo(() => window.matchMedia('(pointer: coarse)').matches, [])
  const [tool, setTool] = useState<ToolId>(coarse ? 'orbit' : 'spray')
  const [colour, setColour] = useState('#f2a65a')
  const [size, setSize] = useState(Math.log2(0.05))
  const [spread, setSpread] = useState(40)
  const [density, setDensity] = useState(6)
  const [flat, setFlat] = useState(true)
  const [opacity, setOpacity] = useState(0.9)
  const [xray, setXray] = useState(false)
  const [reach, setReach] = useState(Math.sqrt(8))
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const hover = useRef<{ x: number; y: number } | null>(null)
  const [message, setMessage] = useState('')

  const blobs = blobsRef.current
  const blobSize = 2 ** size
  // Status messages ("Undone") fade after a moment
  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(''), 2500)
    return () => clearTimeout(t)
  }, [message])

  // --- edits ---------------------------------------------------------------
  const replace = (next: Blobs, name?: string) => {
    blobsRef.current = next
    setSelected(new Set())
    if (name) setSource(name)
    bump()
  }
  const edit = (fn: (b: Blobs) => void) => {
    history.current.record(blobsRef.current)
    fn(blobsRef.current)
    bump()
  }
  const undo = () => { const b = history.current.undo(blobsRef.current); if (b) { replace(b); setMessage('Undone') } }
  const redo = () => { const b = history.current.redo(blobsRef.current); if (b) { replace(b); setMessage('Redone') } }

  const start = (s: (typeof STARTS)[number]) => {
    history.current.record(blobsRef.current)
    const b = s.make()
    replace(b, s.name)
    setOrbit((o) => ({ ...o, ...frame(b) }))
  }

  // Keyboard: undo/redo anywhere on the page, Delete for the selection
  useEffect(() => {
    const on = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement
      if (t.closest('input, textarea, select')) return
      const mod = ev.metaKey || ev.ctrlKey
      if (mod && ev.key.toLowerCase() === 'z') { ev.preventDefault(); if (ev.shiftKey) redo(); else undo() }
      else if (mod && ev.key.toLowerCase() === 'y') { ev.preventDefault(); redo() }
      else if ((ev.key === 'Delete' || ev.key === 'Backspace') && selected.size && t.closest('[data-testid=viewport]')) { ev.preventDefault(); deleteSelected() }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  })

  // --- placing blobs ---------------------------------------------------------
  /** Where a screen point lands: on the nearest blob, else the floor, else a plane through the target. */
  const land = (x: number, y: number): { p: Vec3; n: Vec3 } | null => {
    if (!view) return null
    const { origin, dir } = view.ray(x, y)
    const o: Vec3 = [origin.x, origin.y, origin.z], d: Vec3 = [dir.x, dir.y, dir.z]
    const b = blobsRef.current
    const hit = b.count ? pick(b, o, d, 1.5, 0.2) : { index: -1, t: Infinity }
    if (hit.index >= 0) {
      // A blob's surface normal is its thinnest axis, turned to face the camera
      const s = b.scale.subarray(hit.index * 3, hit.index * 3 + 3)
      const a = s[0] < s[1] ? (s[0] < s[2] ? 0 : 2) : s[1] < s[2] ? 1 : 2
      const R = quatToMat(b.quat.subarray(hit.index * 4, hit.index * 4 + 4))
      let n: Vec3 = [R[a], R[3 + a], R[6 + a]]
      if (n[0] * d[0] + n[1] * d[1] + n[2] * d[2] > 0) n = [-n[0], -n[1], -n[2]]
      // A round blob has no thin axis: use the direction back towards the camera
      if (Math.max(s[0], s[1], s[2]) < Math.min(s[0], s[1], s[2]) * 1.5) n = [-d[0], -d[1], -d[2]]
      return { p: [o[0] + d[0] * hit.t, o[1] + d[1] * hit.t, o[2] + d[2] * hit.t], n }
    }
    if (d[1] < -0.02) {
      const t = -o[1] / d[1]
      if (t > 0 && t < orbit.distance * 6) return { p: [o[0] + d[0] * t, 0, o[2] + d[2] * t], n: [0, 1, 0] }
    }
    // Otherwise a plane through the orbit target, facing the camera
    const tg = orbit.target
    const t = ((tg[0] - o[0]) * d[0] + (tg[1] - o[1]) * d[1] + (tg[2] - o[2]) * d[2])
    return t > 0 ? { p: [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t], n: [-d[0], -d[1], -d[2]] } : null
  }

  const place = (b: Blobs, at: { p: Vec3; n: Vec3 } | null, jitter: number) => {
    if (b.count >= MAX_BLOBS) { setMessage(`The sandbox holds up to ${MAX_BLOBS.toLocaleString()} blobs`); return false }
    if (!at) return false
    const rgb = hexToRgb(colour)
    const s = blobSize * (1 - jitter / 2 + Math.random() * jitter)
    const shade = 1 - jitter * 0.15 + Math.random() * jitter * 0.3
    b.push({
      centre: at.p,
      scale: [s, s * (1 - jitter / 3 + Math.random() * jitter / 3), flat ? s * 0.15 : s],
      quat: quatFacing(at.n),
      colour: [rgb[0] * shade, rgb[1] * shade, rgb[2] * shade],
      opacity,
    })
    return true
  }

  /**
   * One dab: find the surface under the ring's centre once, then scatter the
   * dab's blobs over that surface's tangent plane, sized so the scatter
   * matches the ring on screen. One pick per dab, not one per blob.
   */
  const sprayAt = (x: number, y: number) => {
    const b = blobsRef.current
    const at = land(x, y)
    if (!at || !view) return
    const lens = view.lens()
    const depth = Math.max(0.01, Math.hypot(at.p[0] - view.camera.position.x, at.p[1] - view.camera.position.y, at.p[2] - view.camera.position.z))
    const radius = (spread * depth) / lens.fx
    // Two directions across the surface
    const n = at.n
    const helper: Vec3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
    const u = norm(cross(helper, n)), v = cross(n, u)
    const from = b.count
    for (let k = 0; k < density; k++) {
      const r = radius * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2
      const cu = Math.cos(a) * r, cv = Math.sin(a) * r
      place(b, { p: [at.p[0] + u[0] * cu + v[0] * cv, at.p[1] + u[1] * cu + v[1] * cv, at.p[2] + u[2] * cu + v[2] * cv], n }, 0.5)
    }
    if (b.count > from) changed(from)
  }

  const eraseAt = (x: number, y: number, lens: Lens) => {
    const b = blobsRef.current
    const r2 = spread * spread
    const removed = b.filter((i) => {
      const p = toScreen(b.centre.subarray(i * 3, i * 3 + 3), lens)
      return !p || (p[0] - x) ** 2 + (p[1] - y) ** 2 > r2
    })
    if (removed) { setSelected(new Set()); changed() }
  }

  const deleteSelected = () => {
    const sel = selected
    edit((b) => b.filter((i) => !sel.has(i)))
    setMessage(`Deleted ${sel.size.toLocaleString()} blobs`)
    setSelected(new Set())
  }

  const selectAt = (x: number, y: number, add: boolean) => {
    if (!view) return
    const { origin, dir } = view.ray(x, y)
    const hit = pick(blobsRef.current, [origin.x, origin.y, origin.z], [dir.x, dir.y, dir.z], 2)
    setSelected((s) => {
      if (hit.index < 0) return add ? s : new Set()
      const next = new Set(add ? s : [])
      if (add && s.has(hit.index)) next.delete(hit.index)
      else next.add(hit.index)
      return next
    })
  }

  const last = useRef<{ x: number; y: number } | null>(null)
  // A stroke's "before" picture goes into the history only once the stroke changes something
  const before = useRef<Blobs | null>(null)
  const changed = (from = 0) => {
    if (before.current) { history.current.keep(before.current); before.current = null }
    bump(from)
  }
  const handlers: ToolHandlers | undefined = tool === 'orbit' ? undefined : {
    cursor: tool === 'select' ? 'pointer' : 'crosshair',
    down: (x, y, ev) => {
      if (tool === 'select') { selectAt(x, y, ev.shiftKey || ev.metaKey || ev.ctrlKey); return }
      before.current = blobsRef.current.clone()
      last.current = { x, y }
      if (tool === 'add') { const from = blobsRef.current.count; if (place(blobsRef.current, land(x, y), 0)) changed(from) }
      else if (tool === 'spray') sprayAt(x, y)
      else if (tool === 'erase' && view) eraseAt(x, y, view.lens())
    },
    move: (x, y) => {
      const l = last.current
      if (!l || tool === 'add' || tool === 'select') return
      // Space the dabs out so a slow drag doesn't pile blobs up in one spot
      if (Math.hypot(x - l.x, y - l.y) < Math.max(4, spread / 3)) return
      last.current = { x, y }
      if (tool === 'spray') sprayAt(x, y)
      else if (tool === 'erase' && view) eraseAt(x, y, view.lens())
    },
    up: () => { last.current = null; before.current = null },
    hover: (x, y) => {
      hover.current = x === null || y === null ? null : { x, y }
      view?.invalidate(1)
    },
  }

  // --- selection edits --------------------------------------------------------
  const recolourSelected = () => {
    const rgb = hexToRgb(colour)
    edit((b) => { for (const i of selected) b.colour.set(rgb, i * 3) })
  }
  const resizeSelected = (k: number) => edit((b) => { for (const i of selected) for (let a = 0; a < 3; a++) b.scale[i * 3 + a] *= k })
  const fadeSelected = (k: number) => edit((b) => { for (const i of selected) b.opacity[i] = Math.max(0.02, Math.min(1, b.opacity[i] * k)) })
  const selectAll = () => setSelected(new Set(Array.from({ length: blobsRef.current.count }, (_, i) => i)))

  // --- overlay -----------------------------------------------------------------
  const overlay = (ctx: CanvasRenderingContext2D, lens: Lens) => {
    const b = blobsRef.current
    if (xray) {
      if (b.count <= OUTLINE_LIMIT) drawOutlines(ctx, b, lens, { sigmas: [2] })
      else drawCentres(ctx, b, lens, themeColour('ink'))
    }
    if (selected.size) {
      const list = selected.size > 3000 ? [...selected].slice(0, 3000) : selected
      drawOutlines(ctx, b, lens, { indices: list, sigmas: [2], colour: themeColour('accent'), width: 1.5 })
    }
    const h = hover.current
    if (h && (tool === 'spray' || tool === 'erase')) {
      ctx.strokeStyle = themeColour(tool === 'erase' ? 'ink' : 'accent')
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.arc(h.x, h.y, spread, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }

  const toolNote = TOOLS.find((t) => t.id === tool)!.note

  return (
    <>
      <Crumbs here="Sandbox" />
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-2 pb-6">
        <h1 ref={h1} tabIndex={-1} className="font-serif text-4xl outline-none sm:text-5xl">Sandbox</h1>
        <p className="max-w-xl font-serif text-lg text-ink-muted">Every tool from the lessons, on any scene. Spray blobs into space, pick them apart, and see what they're made of.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
        <section aria-label="Scene" className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Tool">
            {TOOLS.map((t) => <Chip key={t.id} active={tool === t.id} onClick={() => setTool(t.id)}>{t.name}</Chip>)}
            <span className="ml-auto flex gap-1.5">
              <Button small onClick={undo} disabled={!history.current.canUndo} aria-keyshortcuts="Control+Z Meta+Z">Undo</Button>
              <Button small onClick={redo} disabled={!history.current.canRedo} aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z">Redo</Button>
            </span>
          </div>
          <Viewport
            blobs={blobs}
            version={version}
            orbit={orbit}
            setOrbit={setOrbit}
            reach={reach}
            onView={(v) => { setView(v); v.setFloor(true, themeColour('ink-faint')) }}
            tool={handlers}
            overlay={overlay}
            takeSyncFrom={takeSyncFrom}
            label={`Sandbox scene with ${blobs.count.toLocaleString()} blobs. Drag or use the arrow keys to orbit${tool !== 'orbit' ? `; with the ${TOOLS.find((t) => t.id === tool)!.name} tool, click or drag to use it` : ''}.`}
            hint={coarse ? (tool === 'orbit' ? 'drag to orbit · pinch to zoom' : 'pinch to zoom · pick Look to orbit') : tool === 'orbit' ? 'drag to orbit · scroll to zoom' : 'right-drag to orbit · scroll to zoom'}
          />
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-ink-muted">
            <span><span className="tabular-nums text-ink" data-testid="blob-count">{blobs.count.toLocaleString()}</span> blobs</span>
            {selected.size > 0 && <span><span className="tabular-nums text-accent-ink" data-testid="selected-count">{selected.size.toLocaleString()}</span> selected</span>}
            <span className="text-ink-faint">Started from: {source}</span>
            <span aria-live="polite" className="ml-auto text-ink-faint">{message}</span>
          </div>
          <p className="text-sm text-ink-faint">{toolNote}</p>
        </section>

        <section aria-label="Sandbox settings" className="min-w-0">
          <Tabs
            label="Sandbox settings"
            tabs={[
              {
                id: 'brush',
                label: 'Brush',
                summary: `${blobSize.toFixed(3)} · ${flat ? 'flat' : 'round'}`,
                content: (
                  <Panel note="What Add and Spray put down. Each new blob takes the brush colour, with a little variation so sprayed patches don't look flat.">
                    <Field label="Colour">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {SWATCHES.map((c) => (
                          <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={colour === c} onClick={() => setColour(c)} className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${colour === c ? 'border-ink' : 'border-rule'}`} style={{ background: c }} />
                        ))}
                        <input type="color" aria-label="Any colour" value={colour} onChange={(e) => setColour(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-rule bg-transparent" />
                      </div>
                    </Field>
                    <Slider label="Blob size" value={size} min={-7} max={-1} step={0.05} onChange={setSize} format={(v) => (2 ** v).toFixed(3)} />
                    <Slider label="Opacity" value={opacity} min={0.05} max={1} step={0.01} onChange={setOpacity} format={(v) => `${Math.round(v * 100)}%`} />
                    <Slider label="Brush radius" value={spread} min={4} max={120} step={1} onChange={setSpread} format={(v) => `${v}px`} hint="The ring for Spray and Erase." />
                    <Slider label="Density" value={density} min={1} max={30} step={1} onChange={setDensity} format={(v) => `${v} per dab`} />
                    <Toggle label="Flat discs (off = round balls)" checked={flat} onChange={setFlat} />
                  </Panel>
                ),
              },
              {
                id: 'selection',
                label: 'Selection',
                summary: selected.size ? `${selected.size.toLocaleString()} blobs` : 'None',
                content: (
                  <Panel note="Pick blobs with the Select tool. Edits apply to every selected blob and can be undone.">
                    <div className="flex flex-wrap gap-2">
                      <Button small onClick={selectAll} disabled={!blobs.count}>Select all</Button>
                      <Button small onClick={() => setSelected(new Set())} disabled={!selected.size}>Select none</Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button small onClick={recolourSelected} disabled={!selected.size}>
                        <span aria-hidden className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: colour }} />
                        Paint with brush colour
                      </Button>
                      <Button small onClick={() => resizeSelected(1.25)} disabled={!selected.size}>Grow</Button>
                      <Button small onClick={() => resizeSelected(0.8)} disabled={!selected.size}>Shrink</Button>
                      <Button small onClick={() => resizeSelected(0.05)} disabled={!selected.size}>To dots</Button>
                      <Button small onClick={() => fadeSelected(1.25)} disabled={!selected.size}>More opaque</Button>
                      <Button small onClick={() => fadeSelected(0.6)} disabled={!selected.size}>Fade</Button>
                      <Button small onClick={deleteSelected} disabled={!selected.size}>Delete</Button>
                    </div>
                  </Panel>
                ),
              },
              {
                id: 'scene',
                label: 'Scene',
                summary: source,
                content: (
                  <Panel note="Start again from a sample. The current scene can still be brought back with Undo.">
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Start from">
                      {STARTS.map((s) => <Chip key={s.id} active={source === s.name} onClick={() => start(s)}>{s.name}</Chip>)}
                    </div>
                    <Toggle label="X-ray" checked={xray} onChange={setXray} />
                    <p className="text-xs text-ink-faint">X-ray outlines every blob up to {OUTLINE_LIMIT.toLocaleString()}; past that it shows centres as dots.</p>
                    <Slider label="Reach" value={reach} min={0.5} max={3} step={0.01} onChange={setReach} format={(v) => `${v.toFixed(2)}σ`} hint="How far out each blob is drawn. Turn it down to see the individual blobs in a dense scene." />
                    <Button small onClick={() => setOrbit((o) => ({ ...o, ...frame(blobsRef.current) }))}>Frame the scene</Button>
                  </Panel>
                ),
              },
            ]}
          />
        </section>
      </div>
    </>
  )
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
