/**
 * Ink Studio side by side (`/dev/ink-compare/`, dev server only; see scripts/ink-studio-dev.ts): our real Diorama
 * page on the left, in a frame, and the same scene, pose and view drawn by Silicon Jungle's Ink Studio on the right,
 * in whichever of its looks is picked. Looks are JSON files: those in `dev/ink-looks/` and any dropped on the page
 * (translate.ts `readInkLooks`). Nothing here is in the site's build.
 */
import { createRoot } from 'react-dom/client'
import { useEffect, useMemo, useRef, useState } from 'react'
import '../../shared/theme.css'
import { Button, Chip, Toggle } from '../../shared/ui.tsx'
import { InkView, loadInk, type InkDrawn } from './inkView.ts'
import { readInkLooks, type InkLook } from './translate.ts'

/** The look files kept in the repo: our own settings for Ink's looks, written from its docs. */
const KEPT = import.meta.glob('../../../dev/ink-looks/*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

function keptLooks(): { looks: InkLook[]; errors: string[] } {
  const looks: InkLook[] = [], errors: string[] = []
  for (const [path, text] of Object.entries(KEPT)) {
    try { looks.push(...readInkLooks(text, path.split('/').pop()!)) } catch (e) { errors.push((e as Error).message) }
  }
  return { looks, errors }
}

const START = '?scene=windmill&style=pixel'

function Compare() {
  const kept = useMemo(keptLooks, [])
  const [looks, setLooks] = useState(kept.looks)
  const [errors, setErrors] = useState(kept.errors)
  const [picked, setPicked] = useState(kept.looks[0]?.id)
  const [address, setAddress] = useState(() => new URLSearchParams(location.search).get('diorama') ?? START)
  const [shown, setShown] = useState(address)
  const [extras, setExtras] = useState(false)
  const [pixel, setPixel] = useState<number | 'match'>('match')
  const [failed, setFailed] = useState<string>()
  const [drawn, setDrawn] = useState<InkDrawn & { waiting?: string }>()
  const frame = useRef<HTMLIFrameElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const look = looks.find((l) => l.id === picked)
  const lookRef = useRef(look)
  lookRef.current = look
  const opts = useRef({ extras, pixel })
  opts.current = { extras, pixel }

  useEffect(() => {
    let view: InkView | undefined, raf = 0, stopped = false, lastNote = 0
    loadInk().then(({ ink, toolkit }) => {
      if (stopped) return
      view = new InkView(canvas.current!, ink, toolkit)
      const tick = () => {
        raf = requestAnimationFrame(tick)
        const win = frame.current?.contentWindow as (Window & typeof globalThis) | null
        const d = win?.__diorama
        const target = win?.document.querySelector<HTMLCanvasElement>('[data-testid="diorama-view"]')
        let out: InkDrawn & { waiting?: string }
        if (!d || !target) out = { blobs: 0, art: { width: 0, height: 0 }, waiting: 'Waiting for Diorama to start…' }
        else if (!d.stage.shownActors.length) out = { blobs: 0, art: { width: 0, height: 0 }, waiting: 'Waiting for the scene to be cut…' }
        else {
          const rect = target.getBoundingClientRect()
          const art = d.stage.artSize
          const px = opts.current.pixel === 'match' ? (art ? rect.width / art.width : 1) : opts.current.pixel
          const l = lookRef.current
          if (box.current) { box.current.style.width = `${rect.width}px`; box.current.style.height = `${rect.height}px` }
          const pal = d.look()
          out = view!.draw({ stage: d.stage, palette: pal.palette, sky: pal.sky?.[0] }, l, { width: rect.width, height: rect.height, pixel: l?.pixelSize ?? px }, { extras: opts.current.extras, every: 500 })
          canvas.current!.style.width = `${rect.width}px`
          canvas.current!.style.height = `${rect.height}px`
        }
        // the line under the view changes a few times a second at most
        const now = performance.now()
        if (now - lastNote > 250) { lastNote = now; setDrawn(out) }
      }
      tick()
    }).catch((e: Error) => setFailed(e.message))
    return () => { stopped = true; cancelAnimationFrame(raf); view?.dispose() }
  }, [])

  const drop = async (files: FileList | null) => {
    if (!files) return
    const added: InkLook[] = [], bad: string[] = []
    for (const f of Array.from(files)) {
      try { added.push(...readInkLooks(await f.text(), f.name)) } catch (e) { bad.push((e as Error).message) }
    }
    setLooks((ls) => [...ls.filter((l) => !added.some((a) => a.id === l.id)), ...added])
    setErrors(bad)
    if (added[0]) setPicked(added[0].id)
  }

  return (
    <main id="main" className="mx-auto grid max-w-[1800px] gap-4 p-4" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); drop(e.dataTransfer.files) }}>
      <header className="grid gap-1">
        <h1 className="font-display text-2xl">Ink Studio side by side</h1>
        <p className="text-sm text-ink-muted">
          A dev tool, never in the site. Left: our Diorama page, with all its controls. Right: the same scene, pose and view
          drawn by <a className="underline" href="https://github.com/siliconjungle/shapeshift-labs-ink-studio">Silicon Jungle&rsquo;s Ink Studio</a> (MIT) in the look picked below.
          Turn or zoom the left view and the right follows; pause it there to compare one moment.
        </p>
      </header>
      <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); setShown(address); history.replaceState(null, '', `?diorama=${encodeURIComponent(address)}`) }}>
        <label className="text-sm text-ink-muted" htmlFor="addr">Diorama address</label>
        <input id="addr" className="min-w-[18rem] flex-1 rounded border border-rule bg-paper px-2 py-1 font-mono text-sm" value={address} onChange={(e) => setAddress(e.target.value)} />
        <Button type="submit" small>Open</Button>
      </form>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <iframe ref={frame} title="Diorama" src={`/experiments/diorama/${shown.startsWith('?') ? shown : `?${shown}`}`} className="h-[92svh] w-full rounded border border-rule" />
        <section className="sticky top-4 grid gap-3" aria-label="Ink Studio">
          <div ref={box} className="relative max-w-full overflow-hidden rounded border border-rule bg-paper-sunk">
            <canvas ref={canvas} className="block" style={{ imageRendering: 'pixelated' }} data-testid="ink-view" />
            {(failed || drawn?.waiting) && <p className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-ink-muted">{failed ?? drawn?.waiting}</p>}
          </div>
          <p role="status" className="text-xs text-ink-faint">
            {failed ? 'Ink Studio did not load.' : drawn?.error ? `Ink Studio: ${drawn.error}` : drawn && !drawn.waiting ? `${drawn.blobs.toLocaleString()} blobs, art ${drawn.art.width} × ${drawn.art.height}` : ''}
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Ink look">
            {looks.map((l) => <Chip key={l.id} active={l.id === picked} onClick={() => setPicked(l.id)} small>{l.label}</Chip>)}
          </div>
          <label className="text-sm text-ink-muted">Add looks: drop JSON files anywhere on the page, or <input type="file" accept=".json,application/json" multiple onChange={(e) => drop(e.target.files)} className="text-sm" /></label>
          {errors.map((e) => <p key={e} className="text-sm text-accent">{e}</p>)}
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Ink art pixel size">
            <span className="text-sm text-ink-muted">Art pixel</span>
            {(['match', 1, 2, 3, 4] as const).map((p) => <Chip key={p} small active={pixel === p} onClick={() => setPixel(p)}>{p === 'match' ? 'As Diorama' : `${p}×`}</Chip>)}
          </div>
          <Toggle label="Include weather, water and fire (the stage's extras)" checked={extras} onChange={setExtras} />
          {look && <details className="text-sm"><summary className="cursor-pointer text-ink-muted">This look&rsquo;s settings ({look.source})</summary><pre className="mt-2 overflow-auto rounded bg-paper-sunk p-2 text-xs">{JSON.stringify({ look: look.look, frame: look.frame, world: look.world, colorMode: look.colorMode, palette: look.palette, asset: look.asset?.id }, null, 2)}</pre></details>}
        </section>
      </div>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<Compare />)
