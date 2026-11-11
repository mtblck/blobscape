import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState } from 'react'
import '../shared/theme.css'
import { SiteHeader } from '../shared/SiteHeader.tsx'
import { Button, Chip, Field, Toggle } from '../shared/ui.tsx'
import { startLab, type BenchResult, type Lab, type LabOptions, type Which } from './lab.ts'
import type { SkinMode } from '../splat-engine/rig.ts'

/**
 * Unlisted page for trying the engine on any device: pick a renderer and a blob
 * count, watch the fox walk, and press Time it. Every setting is also a URL
 * parameter (?which=engine&n=200000&walk=1&mode=quat&webgl=0&herd=1), so a
 * phone can open a ready-made test from a link, and verify can drive it.
 */
const params = new URLSearchParams(location.search)
const initial: LabOptions = {
  which: (params.get('which') as Which) || 'engine',
  count: Number(params.get('n')) || 20000,
  walk: params.get('walk') !== '0',
  mode: (params.get('mode') as SkinMode) || 'quat',
  webgl: params.get('webgl') === '1',
  herd: Math.max(1, Math.min(12, Number(params.get('herd')) || 1)),
  offscreen: params.get('offscreen') === '1',
}
const COUNTS = [20000, 100000, 200000, 500000]

declare global {
  interface Window { __lab?: Lab; __labError?: string }
}

function App() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [opts, setOpts] = useState(initial)
  const [lab, setLab] = useState<Lab>()
  const [error, setError] = useState<string>()
  const [results, setResults] = useState<BenchResult[]>([])
  const [timing, setTiming] = useState(false)

  useEffect(() => {
    let live: Lab | undefined, gone = false
    setLab(undefined)
    setError(undefined)
    const q = new URLSearchParams({ which: opts.which, n: String(opts.count), walk: opts.walk ? '1' : '0', mode: opts.mode, webgl: opts.webgl ? '1' : '0', herd: String(opts.herd), ...(opts.offscreen ? { offscreen: '1' } : {}) })
    history.replaceState(null, '', `?${q}`)
    startLab(canvas.current!, opts).then((l) => {
      if (gone) { l.dispose(); return }
      live = l
      window.__lab = l
      setLab(l)
    }, (e: unknown) => {
      window.__labError = String(e)
      setError(String(e))
    })
    return () => { gone = true; live?.dispose() }
    // walk and mode change live, without a rebuild
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.which, opts.count, opts.webgl, opts.herd])

  const set = (p: Partial<LabOptions>) => setOpts((o) => ({ ...o, ...p }))

  const time = async () => {
    if (!lab) return
    setTiming(true)
    const r = await lab.bench(60)
    setResults((rs) => [r, ...rs].slice(0, 12))
    setTiming(false)
  }

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
        <div>
          <h1 className="font-serif text-3xl text-ink">Engine lab</h1>
          <p className="mt-1 max-w-[65ch] text-ink-muted">A blob fox, drawn by Blobscape's own engine or by three.js's built-in splat renderer, and timed. Open it on a phone and press Time it.</p>
        </div>
        <div className="case relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-[#14110e] sm:aspect-[16/9]">
          <canvas ref={canvas} className="h-full w-full touch-none" aria-label="A blob fox trotting on the spot" />
          <p className="absolute bottom-2.5 left-3 text-sm text-white/70" aria-live="polite">{error ? `Couldn't start: ${error}` : lab ? lab.info : 'Starting…'}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Renderer">
            <div className="flex flex-wrap gap-2">
              <Chip active={opts.which === 'engine' && !opts.webgl} onClick={() => set({ which: 'engine', webgl: false })}>Ours, WebGPU</Chip>
              <Chip active={opts.which === 'engine' && opts.webgl} onClick={() => set({ which: 'engine', webgl: true })}>Ours, WebGL</Chip>
              <Chip active={opts.which === 'three'} onClick={() => set({ which: 'three', webgl: false })}>three.js</Chip>
            </div>
          </Field>
          <Field label="Blobs">
            <div className="flex flex-wrap gap-2">
              {COUNTS.map((n) => <Chip key={n} active={opts.count === n} onClick={() => set({ count: n })}>{n >= 1e6 ? `${n / 1e6}M` : `${n / 1000}k`}</Chip>)}
            </div>
          </Field>
          <Field label="Joints">
            <div className="flex flex-wrap gap-2">
              <Chip active={opts.mode === 'quat'} onClick={() => { set({ mode: 'quat' }); lab?.setMode('quat') }}>Turn blobs</Chip>
              <Chip active={opts.mode === 'linear'} onClick={() => { set({ mode: 'linear' }); lab?.setMode('linear') }}>Blend matrices</Chip>
            </div>
          </Field>
          <div className="flex flex-col gap-3">
            <Toggle label="Walk" checked={opts.walk} onChange={(v) => { set({ walk: v }); lab?.setWalk(v) }} />
            <Button primary disabled={!lab || timing} onClick={time}>{timing ? 'Timing…' : 'Time it'}</Button>
          </div>
        </div>
        {results.length > 0 && (
          <table className="w-full text-left text-sm">
            <caption className="mb-2 text-left text-ink-muted">Milliseconds per frame over 60 frames, including waiting for the GPU</caption>
            <thead><tr className="text-ink-faint"><th className="py-1 font-medium">Renderer</th><th className="font-medium">Blobs</th><th className="font-medium">Median</th><th className="font-medium">Slowest 10%</th><th className="font-medium">CPU</th><th className="font-medium">Canvas</th></tr></thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className="border-t border-rule">
                  <td className="py-1">{r.which} · {r.backend}</td><td>{r.blobs.toLocaleString()}</td><td>{r.median.toFixed(1)}</td><td>{r.p90.toFixed(1)}</td><td>{r.cpu.toFixed(1)}</td><td>{r.width}×{r.height}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
