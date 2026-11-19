import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Orbit } from '../splat-core/view.ts'
import type { MarkLook } from '../splat-core/marks.ts'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { Button, Chip, Field, Slider, Toggle } from '../shared/ui.tsx'
import { TAB_SECTIONS, Workbench } from '../shared/Workbench.tsx'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { ZoomBar, beginOrbitDrag, dragOrbit, orbitKey, useWheelZoom, type OrbitDrag } from './Viewport.tsx'
import { PAPERS, css } from './brushLooks.ts'
import { BACKDROPS as CEL_BACKDROPS, CEL_START, celLook } from './celLooks.ts'
import { ROLE_NOTES, SHAPES, SIZES, inWords, type Shape, type Size } from './bouquet/arrange.ts'
import { DETAILS, fallen, makeBouquet, poseBouquet, setShedding, shedOne, type Bouquet } from './bouquet/bouquet.ts'
import { PALETTES, SEASONS, seasonOn, type Role, type Season } from './bouquet/flowers.ts'
import { TABLES, type TableKind } from './bouquet/tables.ts'
import { VASES, type VaseKind } from './bouquet/vases.ts'
import { detailAsked, labelNames, writeDetail } from '../shared/detail.ts'
import type { CreatureStage } from './creature/stage.ts'
import { href } from './routes.ts'

/** How the bouquet is drawn: soft blobs, or one of the painted looks or cel shading from Brush and Ink. */
const LOOKS: { id: 'blobs' | 'gouache' | 'oil' | 'ink' | 'cel'; label: string }[] = [{ id: 'blobs', label: 'Soft' }, { id: 'gouache', label: 'Gouache' }, { id: 'oil', label: 'Oil' }, { id: 'ink', label: 'Ink and wash' }, { id: 'cel', label: 'Cel shading' }]
/** What stands behind the table. */
const BACKDROPS: { id: string; label: string; color?: string; dark: boolean }[] = [
  { id: 'linen', label: 'Linen', color: '#ebe5d8', dark: false },
  { id: 'dark', label: 'Dark', dark: true },
  { id: 'sage', label: 'Sage', color: '#b9c7b4', dark: false },
  { id: 'blush', label: 'Blush', color: '#ecd3cc', dark: false },
  { id: 'dusk', label: 'Dusk blue', color: '#3a4a66', dark: true },
]
const MAX_SEED = 999999
const ROLES: Role[] = ['focal', 'second', 'line', 'filler', 'green']

const params = () => new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
const media = (q: string) => typeof window !== 'undefined' && window.matchMedia(q).matches
const oneOf = <T extends string>(list: readonly { id: T }[], s: string | null): T | undefined => list.find((x) => x.id === s)?.id
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

declare global {
  interface Window { __bouquet?: { stage: CreatureStage; blobs: () => number; bones: () => number; stems: () => number; fallen: () => number; shed: () => boolean; lines: () => string[]; vase: () => string; table: () => string } }
}

/** The camera for a bouquet: the whole of it, table to tallest stem, keeping the side it was looked at from. */
function framed(b: Bouquet, from: Orbit): Orbit {
  return { target: [0, b.height * 0.47, 0], distance: Math.max(1.65 * b.height, 2.5 * b.width, 2.2) + 0.2, azimuth: from.azimuth, elevation: from.elevation }
}

/**
 * Seasonal Bouquets: a florist that never makes the same bunch twice. Every flower is grown from a recipe, petal by
 * petal, and arranged by a florist's rules in a vase that suits the season. Stems sway, and now and then a petal
 * lets go.
 */
export function Bouquets() {
  const h1 = useFocusHeading()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState<CreatureStage>()
  const [drawn, setDrawn] = useState(false)
  const [failed, setFailed] = useState<string>()
  const offscreen = useMemo(() => params().get('offscreen') === '1', [])
  const coarse = useMemo(() => media('(pointer: coarse)'), [])
  const calm = useMemo(() => media('(prefers-reduced-motion: reduce)'), [])
  const [playing, setPlaying] = useState(!calm)

  const [season, setSeason] = useState<Season>(() => oneOf(SEASONS, params().get('season')) ?? seasonOn(new Date()))
  const [seed, setSeed] = useState(() => { const n = Math.floor(Number(params().get('seed'))); return n >= 1 && n <= MAX_SEED ? n : 1 + Math.floor(Math.random() * MAX_SEED) })
  const [size, setSize] = useState<Size>(() => oneOf(SIZES, params().get('size')) ?? 'bouquet')
  const [shape, setShape] = useState<Shape>(() => oneOf(SHAPES, params().get('shape')) ?? 'round')
  const [palette, setPalette] = useState<string>(() => params().get('palette') ?? '')
  const [vase, setVase] = useState<VaseKind | ''>(() => oneOf(VASES, params().get('vase')) ?? '')
  const [table, setTable] = useState<TableKind | ''>(() => oneOf(TABLES, params().get('table')) ?? '')
  const [detail, setDetail] = useState(() => detailAsked(DETAILS, labelNames)?.id ?? (coarse ? 'light' : 'fine'))
  // the draft and the petals are in the address only once the visitor has moved them from how they start
  const [draft, setDraft] = useState(() => { const q = params().get('draft'), n = Number(q); return q !== null && q !== '' && n >= 0 && n <= 2 ? Math.round(n * 10) / 10 : 1 })
  const [shedding, setShedding_] = useState(() => params().get('petals') !== '0')
  const [look, setLook] = useState<(typeof LOOKS)[number]['id']>(() => oneOf(LOOKS, params().get('look')) ?? 'blobs')
  const [backdrop, setBackdrop] = useState(() => oneOf(BACKDROPS, params().get('backdrop')) ?? 'linen')
  const [orbit, setOrbit] = useState<Orbit>({ target: [0, 0.65, 0], distance: 3.2, azimuth: 24, elevation: 12 })
  const [bouquet, setBouquet] = useState<Bouquet>()
  const [down, setDown] = useState(0)
  // a palette belongs to its season: one from another season means the florist chooses
  const paletteHere = PALETTES[season].find((p) => p.id === palette)?.id

  useEffect(() => {
    let live: CreatureStage | undefined, gone = false
    import('./creature/stage.ts')
      .then(({ CreatureStage }) => CreatureStage.start(canvas.current!, { offscreen, lights: true, webgl: params().get('webgl') === '1' }))
      .then((s) => {
        if (gone) { s.dispose(); return }
        live = s
        s.onFirstFrame = () => setDrawn(true)
        s.setFloor(0)
        setStage(s)
      }, (e: unknown) => { console.warn(e); setFailed('This browser could not start WebGPU or WebGL 2, which the bouquet needs.') })
    return () => { gone = true; live?.dispose() }
  }, [offscreen])

  // made after a paint, so the waiting mark goes up first; the bouquet on show stays until the next is ready
  // cel shading lights the blobs itself, so its bouquet is grown with no light baked in
  const plain = look === 'cel'
  const [making, setMaking] = useState(true)
  useEffect(() => {
    setMaking(true)
    const t = setTimeout(() => {
      setBouquet(makeBouquet({ season, seed, size, shape, palette: paletteHere, vase: vase || undefined, table: table || undefined }, DETAILS.find((d) => d.id === detail)!.spacing, plain))
      setMaking(false)
    }, 30)
    return () => clearTimeout(t)
  }, [season, seed, size, shape, paletteHere, vase, table, detail, plain])

  const live = useRef({ draft, shedding })
  live.current = { draft, shedding }
  useEffect(() => {
    if (!stage || !bouquet) return
    bouquet.draft = live.current.draft
    setShedding(bouquet, live.current.shedding, 0)
    stage.setActor(bouquet)
    stage.setLights([], 1)
    stage.setPoser((sk, t) => poseBouquet(bouquet, sk, t), 0)
    setOrbit((o) => framed(bouquet, o))
    setDown(0)
  }, [stage, bouquet])
  useEffect(() => { if (bouquet) { bouquet.draft = draft; stage?.invalidate() } }, [stage, bouquet, draft])
  useEffect(() => { if (bouquet && stage) setShedding(bouquet, shedding, stage.time) }, [stage, bouquet, shedding])
  useEffect(() => { if (stage) stage.playing = playing }, [stage, playing])
  useEffect(() => { if (stage) { stage.orbit = orbit; stage.invalidate() } }, [stage, orbit])
  // how many petals are down, a couple of times a second (it's text)
  useEffect(() => {
    if (!stage || !bouquet) return
    const id = setInterval(() => setDown(fallen(bouquet, stage.time)), 500)
    return () => clearInterval(id)
  }, [stage, bouquet])

  const sheet = PAPERS[0]
  const dark = BACKDROPS.find((b) => b.id === backdrop)!.dark
  const marks = useMemo<MarkLook | undefined>(() => (look === 'blobs' || look === 'cel' ? undefined : { kind: look, size: 1, ink: sheet.ink, paper: sheet.paper }), [look, sheet])
  useEffect(() => { stage?.setMarks(marks) }, [stage, marks, bouquet])
  useEffect(() => { stage?.setOutline(look === 'ink' ? { width: 1.5, ink: sheet.ink } : undefined) }, [stage, look, sheet, bouquet])

  // the address always names the bouquet on show, so it can be sent to someone
  useEffect(() => {
    const url = new URL(location.href)
    const put = (k: string, v: string | undefined) => { if (v) url.searchParams.set(k, v); else url.searchParams.delete(k) }
    put('season', season); put('seed', String(seed)); put('size', size === 'bouquet' ? undefined : size); put('shape', shape === 'round' ? undefined : shape)
    put('palette', paletteHere); put('vase', vase || undefined); put('table', table || undefined); put('draft', draft === 1 ? undefined : String(draft)); put('petals', shedding ? undefined : '0'); put('look', look === 'blobs' ? undefined : look); put('backdrop', backdrop === 'linen' ? undefined : backdrop)
    history.replaceState(history.state, '', url)
  }, [season, seed, size, shape, paletteHere, vase, table, draft, shedding, look, backdrop])

  const drop = useCallback(() => { if (bouquet && stage) { const did = shedOne(bouquet, stage.time); stage.invalidate(); return did } return false }, [bouquet, stage])
  // For verify: the stage and the bouquet, without clicking
  useEffect(() => {
    if (!stage || !bouquet) return
    window.__bouquet = { stage, blobs: () => stage.blobCount, bones: () => bouquet.skeleton.count, stems: () => bouquet.stems.length, fallen: () => fallen(bouquet, stage.time), shed: drop, lines: () => bouquet.plan.lines.map(inWords), vase: () => bouquet.vase.name, table: () => bouquet.table.name }
    return () => { delete window.__bouquet }
  }, [stage, bouquet, drop])

  const drag = useRef<OrbitDrag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  // the cel's light comes from the front left of the view the bouquet starts in; its shade and line suit the backdrop
  const cel = useMemo(() => (look === 'cel' ? { ...celLook({ ...CEL_START, turn: CEL_START.turn + 24 }), shade: CEL_BACKDROPS[dark ? 3 : 1].shade, ink: CEL_BACKDROPS[dark ? 3 : 1].ink } : undefined), [look, dark])
  useEffect(() => { stage?.setCel(cel) }, [stage, cel, bouquet])

  useWheelZoom(canvas, setOrbit)
  const another = () => setSeed(1 + Math.floor(Math.random() * MAX_SEED))
  const back = BACKDROPS.find((b) => b.id === backdrop)!
  const ground = look === 'ink' ? css(sheet.paper) : back.color
  const onDark = look === 'ink' ? false : back.dark
  const waiting = !failed && (!drawn || !bouquet)
  const left = bouquet ? bouquet.falling.length - down : 0
  const backend = stage ? (stage.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2') : 'WebGPU or WebGL 2'
  const summary = bouquet ? `${cap(SEASONS.find((s) => s.id === bouquet.plan.choice.season)!.label)} bouquet number ${bouquet.plan.choice.seed}, in the ${bouquet.plan.palette.label} palette, in ${bouquet.vase.name}` : 'A bouquet'

  return (
    <div className="pb-4">
      <Crumbs here="Seasonal Bouquets" parent={{ label: 'Experiments', href: href({ page: 'experiments' }) }} />
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-4 pb-6">
        <h1 ref={h1} tabIndex={-1} className="font-display text-4xl outline-none sm:text-5xl">Seasonal Bouquets</h1>
        <p className="max-w-xl text-lg text-ink-muted">
          A florist that never ties the same bunch twice. Every flower is grown petal by petal from a recipe, then arranged the way a
          florist would: big blooms low in the middle, tall stems for height, small flowers and leaves to fill. Pick a season and ask for another.
        </p>
      </header>
      <Workbench
        viewLabel="The bouquet"
        view={<>
              {ground && <div aria-hidden className="absolute inset-0" style={{ background: ground }} data-testid="bouquet-ground" />}
              <canvas
                ref={canvas}
                role="application"
                aria-roledescription="3D view"
                aria-label={`${summary}${bouquet ? `: ${bouquet.plan.lines.map(inWords).join(', ')}` : ''}. Drag or use the arrow keys to orbit; scroll, pinch or press plus and minus to zoom.`}
                tabIndex={0}
                data-testid="bouquet-view"
                className="absolute inset-0 h-full w-full cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset active:cursor-grabbing"
                onPointerDown={(ev) => {
                  ev.currentTarget.setPointerCapture(ev.pointerId)
                  pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
                  drag.current = beginOrbitDrag(pointers.current, ev, orbit)
                }}
                onPointerMove={(ev) => {
                  if (pointers.current.has(ev.pointerId)) pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
                  const d = drag.current
                  if (d) setOrbit(dragOrbit(d, pointers.current, ev))
                }}
                onPointerUp={(ev) => { pointers.current.delete(ev.pointerId); drag.current = null }}
                onPointerCancel={(ev) => { pointers.current.delete(ev.pointerId); drag.current = null }}
                onKeyDown={(ev) => {
                  if (!orbitKey(ev, orbit)) return
                  ev.preventDefault()
                  setOrbit((o) => orbitKey(ev, o) ?? o)
                }}
              />
              {!failed && (waiting || making) && <LoadingMark testid="bouquet-loading" />}
              <p role="status" className="sr-only">{waiting || making ? (stage ? 'Picking flowers…' : 'Starting the splat engine…') : bouquet ? `${summary}.` : ''}</p>
              {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{failed}</div>}
              <div className="absolute top-3 left-3 max-sm:top-2 max-sm:left-2">
                <Button small primary onClick={another} data-testid="bouquet-another">Another bouquet</Button>
              </div>
              <ZoomBar orbit={orbit} setOrbit={setOrbit} onReset={() => bouquet && setOrbit(framed(bouquet, { ...orbit, azimuth: 24, elevation: 12 }))} />
              <p aria-hidden className="pointer-events-none absolute right-14 bottom-2 left-12 text-right text-xs" style={{ color: onDark ? 'rgb(255 255 255 / 0.55)' : 'rgb(0 0 0 / 0.55)' }}>{coarse ? 'drag to orbit · pinch to zoom' : 'drag to orbit · scroll to zoom'}</p>
        </>}
        status={<>
              <span>{bouquet ? <><span className="text-ink" data-testid="bouquet-name">{cap(bouquet.plan.choice.season)} no. {bouquet.plan.choice.seed}</span>, {bouquet.plan.palette.label.toLowerCase()} palette, in {bouquet.vase.name}.</> : 'Picking flowers…'}</span>
              <span>{bouquet && <><span className="tabular-nums text-ink" data-testid="bouquet-stems">{bouquet.stems.length}</span> stems, <span className="tabular-nums text-ink" data-testid="bouquet-blobs">{bouquet.blobs.count.toLocaleString()}</span> blobs</>}</span>
        </>}
        tabsLabel="Options"
        tabs={[
          {
            id: 'bouquet', label: 'Bouquet', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Season">
                  <div className="flex flex-wrap gap-1.5" data-testid="bouquet-seasons">
                    {SEASONS.map((s) => <Chip key={s.id} active={season === s.id} onClick={() => setSeason(s.id)}>{s.label}</Chip>)}
                  </div>
                </Field>
                <Field label="Palette">
                  <div className="flex flex-wrap gap-1.5">
                    <Chip active={!paletteHere} onClick={() => setPalette('')}>Florist's choice</Chip>
                    {PALETTES[season].map((p) => <Chip key={p.id} active={paletteHere === p.id} onClick={() => setPalette(p.id)}>{p.label}</Chip>)}
                  </div>
                </Field>
                <Field label="Size">
                  <div className="flex flex-wrap gap-1.5">
                    {SIZES.map((s) => <Chip key={s.id} active={size === s.id} onClick={() => setSize(s.id)}>{s.label}</Chip>)}
                  </div>
                </Field>
                <Field label="Shape">
                  <div className="flex flex-wrap gap-1.5">
                    {SHAPES.map((s) => <Chip key={s.id} active={shape === s.id} onClick={() => setShape(s.id)}>{s.label}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">{cap(SHAPES.find((s) => s.id === shape)!.note)}.</p>
                </Field>
                <div className="flex flex-wrap items-center gap-2">
                  <Button primary onClick={another}>Another bouquet</Button>
                  <span className="text-xs text-ink-faint">The address names this one, so you can send it to someone.</span>
                </div>
              </div>
            ),
          },
          {
            id: 'vase', label: 'Vase', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Stands in">
                  <div className="flex flex-wrap gap-1.5" data-testid="bouquet-vases">
                    <Chip active={!vase} onClick={() => setVase('')}>Season's choice</Chip>
                    {VASES.map((v) => <Chip key={v.id} active={vase === v.id} onClick={() => setVase(v.id)}>{v.label}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">Each season has its own: a rain boot in spring, a watering can in summer, a pumpkin in fall and a snowman in winter. Its color and shape change with the bouquet.</p>
                </Field>
                <Field label="Stands on">
                  <div className="flex flex-wrap gap-1.5" data-testid="bouquet-tables">
                    <Chip active={!table} onClick={() => setTable('')}>Any table</Chip>
                    {TABLES.map((t) => <Chip key={t.id} active={table === t.id} onClick={() => setTable(t.id)}>{t.label}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">{bouquet ? `${cap(bouquet.table.name)}. ` : ''}Tip the view down to see its legs.</p>
                </Field>
                <Field label="Behind it">
                  <div className="flex flex-wrap gap-1.5">
                    {BACKDROPS.map((b) => <Chip key={b.id} active={backdrop === b.id} onClick={() => setBackdrop(b.id)}>{b.label}</Chip>)}
                  </div>
                </Field>
              </div>
            ),
          },
          {
            id: 'view', label: 'View', content: (
              <div className={TAB_SECTIONS}>
                <div className="grid gap-3">
                  <Slider label="Draft" value={draft} min={0} max={2} step={0.1} onChange={setDraft} format={(v) => (v === 0 ? 'still' : v < 0.7 ? 'light' : v < 1.4 ? 'gentle' : 'breezy')} hint="How much the stems sway." />
                  <Toggle label="Petals fall now and then" checked={shedding} onChange={setShedding_} />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button small onClick={drop} disabled={!left} data-testid="bouquet-drop">Shake a petal loose</Button>
                    <Button small onClick={() => setPlaying((p) => !p)}>{playing ? 'Hold still' : 'Let it move'}</Button>
                    <span className="text-xs text-ink-faint" data-testid="bouquet-fallen">{bouquet ? (down ? `${down} on the table, ${left} to go` : `${left} loose petals`) : ''}</span>
                  </div>
                </div>
                <Field label="Drawn as">
                  <div className="flex flex-wrap gap-1.5">
                    {LOOKS.map((l) => <Chip key={l.id} active={look === l.id} onClick={() => setLook(l.id)}>{l.label}</Chip>)}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">The painted looks and cel shading are the ones from <a href={href({ page: 'brush' })} className="underline decoration-rule underline-offset-2 hover:text-accent">Brush and Ink</a>.</p>
                </Field>
                <Field label="Detail">
                  <div className="flex flex-wrap gap-1.5">
                    {DETAILS.map((d) => <Chip key={d.id} active={detail === d.id} onClick={() => { setDetail(d.id); writeDetail(d.id) }}>{d.label}</Chip>)}
                  </div>
                </Field>
              </div>
            ),
          },
        ]}
      />

      <section aria-labelledby="in-title" className="mt-10 rounded-2xl border border-rule bg-paper-sunk/60 px-5 py-5" data-testid="bouquet-list">
        <h2 id="in-title" className="font-display text-2xl">In this bouquet</h2>
        {bouquet ? (
          <dl className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-5">
            {ROLES.map((r) => {
              const lines = bouquet.plan.lines.filter((l) => l.role === r)
              return (
                <div key={r}>
                  <dt className="text-sm font-bold">{ROLE_NOTES[r].label}</dt>
                  <dd className="mt-1 text-sm text-ink-muted">
                    <ul className="grid gap-0.5 text-ink">{lines.map((l, i) => <li key={i}>{cap(inWords(l))}</li>)}</ul>
                    <p className="mt-1.5 text-xs leading-relaxed text-ink-faint">{cap(ROLE_NOTES[r].note)}.</p>
                  </dd>
                </div>
              )
            })}
          </dl>
        ) : <p className="mt-3 text-sm text-ink-muted">Picking flowers…</p>}
      </section>

      <section aria-labelledby="how-title" className="mt-14 border-t border-rule pt-10 lg:grid lg:grid-cols-12 lg:gap-x-5 lg:pt-14">
        <div className="lg:col-span-5">
          <p className="text-sm text-ink-faint">How it's made</p>
          <h2 id="how-title" className="mt-1 max-w-[16ch] font-display text-4xl leading-[1.05] text-balance sm:text-5xl">Grown from a recipe, arranged by the rules</h2>
        </div>
        <div className="mt-8 max-w-[36em] space-y-4 text-lg leading-relaxed text-ink-muted lg:col-span-7 lg:mt-0 lg:text-xl">
          <p>
            No flower here is a model someone made. A petal is a surface with a dozen numbers: how long and wide it is, where it is
            widest, the angle it leaves the flower at and the angle at its tip, how its edges cup and ruffle. A rose is thirty-four of
            them in a spiral, tight and upright in the middle and open at the outside. A delphinium is thirty small flowers up a
            stalk, a hydrangea seventy on a dome. Each petal is covered in flat blobs, so no two flowers come out quite alike.
          </p>
          <p>
            The arranging follows what florists teach. A bouquet has a few big focal blooms, smaller second blooms round them, line
            flowers for height, fillers for the gaps and greenery to frame it, in odd numbers and in colors from one palette. Focal
            blooms sit low in the middle, fillers just proud of them, greens round the collar. Stems of a kind stay near each other,
            and each head goes where it has the most room. Every season has about ten flowers of its own and a vase to match.
          </p>
          <p>
            Each stem is three bones, so it sways, and a few outer petals have a bone of their own, so they can let go and settle on
            the table. Blobscape's own splat engine draws it here on {backend}. The same engine moves the creatures
            in <a href={href({ page: 'creature' })} className="underline decoration-rule underline-offset-2 hover:text-accent">Splat Creatures</a> and
            grows the plants in <a href={href({ page: 'forest' })} className="underline decoration-rule underline-offset-2 hover:text-accent">Forest Walk</a>.
          </p>
        </div>
      </section>
    </div>
  )
}
