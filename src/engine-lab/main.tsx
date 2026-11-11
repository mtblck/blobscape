import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState } from 'react'
import '../shared/theme.css'
import { SiteHeader } from '../shared/SiteHeader.tsx'
import { Button, Chip, Field, Toggle } from '../shared/ui.tsx'
import { WHICH, startLab, type BenchResult, type Lab, type LabOptions, type StepTimes, type Which } from './lab.ts'
import { makeCreature, poseWalk } from '../splat-engine/creature.ts'
import { recordClip, writeRiggedGlb, writeRiggedMeshGlb } from '../splat-engine/glb.ts'
import { blobsToMesh } from '../splat-engine/mesh.ts'

/** The fox as a rigged .glb with its trot: what Creature will export. */
function foxGlb(count: number) {
  const fox = makeCreature(count)
  const trot = recordClip('trot', fox.skeleton, poseWalk, 1 / 1.4, 24)
  fox.skeleton.reset()
  fox.skeleton.update()
  return writeRiggedGlb({ name: 'fox', ...fox, clips: [trot] })
}

async function downloadGlb(count: number) {
  const bytes = foxGlb(count)
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'model/gltf-binary' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'blob-fox.glb'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Unlisted page for trying the engine on any device: pick a renderer and a blob
 * count, watch the fox walk, and press Time it. Every setting is also a URL
 * parameter (?which=engine&n=200000&walk=1&mode=quat&webgl=0&herd=1), so a
 * phone can open a ready-made test from a link, and verify can drive it.
 */
const params = new URLSearchParams(location.search)
const initial: LabOptions = {
  which: WHICH.includes(params.get('which') as Which) ? (params.get('which') as Which) : 'engine',
  count: Math.max(1000, Math.min(2e6, Number(params.get('n')) || 20000)),
  walk: params.get('walk') !== '0',
  mode: params.get('mode') === 'linear' ? 'linear' : 'quat',
  webgl: params.get('webgl') === '1',
  herd: Math.max(1, Math.min(12, Number(params.get('herd')) || 1)),
  offscreen: params.get('offscreen') === '1',
}
const COUNTS = [20000, 100000, 200000, 500000]

// For verify: write the fox, read it back with three.js's own loader
window.__glbCheck = async () => {
  const bytes = foxGlb(5000)
  const { loadWithThree } = await import('./glbCheck.ts')
  return { bytes: bytes.byteLength, ...(await loadWithThree(bytes)) }
}
/** The same fox as a solid mesh .glb, opened by three.js: a skinned mesh with the trot. */
window.__meshGlbCheck = async () => {
  const fox = makeCreature(5000)
  const trot = recordClip('trot', fox.skeleton, poseWalk, 1 / 1.4, 24)
  fox.skeleton.reset()
  fox.skeleton.update()
  const bytes = writeRiggedMeshGlb({ name: 'fox', mesh: blobsToMesh(fox.blobs, fox.skin, { cells: 48, level: 1 }), skeleton: fox.skeleton, clips: [trot] })
  const { loadWithThree } = await import('./glbCheck.ts')
  return { bytes: bytes.byteLength, ...(await loadWithThree(bytes)) }
}

declare global {
  interface Window { __lab?: Lab; __labError?: string; __glbCheck?: () => Promise<unknown>; __meshGlbCheck?: () => Promise<unknown>; __sheet?: () => Promise<{ cols: number; rows: number; size: number; solid: number[] }> }
}

function App() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [opts, setOpts] = useState(initial)
  const [lab, setLab] = useState<Lab>()
  const [error, setError] = useState<string>()
  const [results, setResults] = useState<BenchResult[]>([])
  const [timing, setTiming] = useState(false)
  const [steps, setSteps] = useState<StepTimes[]>([])
  const [sheet, setSheet] = useState<{ url: string; json: string }>()
  const [making, setMaking] = useState(false)

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

  // one job at a time: timing and drawing the sheet share the renderer
  const working = timing || making

  const sheetJob = async () => {
    if (!lab) return null
    setMaking(true)
    try {
      const { makeWalkSheet } = await import('../splat-engine/walkSheet.ts')
      const s = await lab.exclusive(() => makeWalkSheet(lab.renderer))
      const png = await s.png()
      if (sheet) URL.revokeObjectURL(sheet.url)
      setSheet({ url: URL.createObjectURL(png), json: JSON.stringify(s.json('blob-fox.png'), null, 2) })
      return s
    } finally {
      setMaking(false)
    }
  }
  const makeSheet = () => sheetJob().catch((e: unknown) => { setError(`Couldn't draw the sheet: ${e}`); return null })

  useEffect(() => {
    window.__sheet = async () => {
      const s = await sheetJob()
      if (!s) throw new Error('lab not ready')
      return { cols: s.cols, rows: s.rows, size: s.size, solid: s.frames.map((f) => { let k = 0; for (let i = 3; i < f.data.length; i += 4) if (f.data[i]) k++; return k }) }
    }
  })

  const timeSteps = async () => {
    if (!lab) return
    setTiming(true)
    try {
      const r = await lab.profile(20)
      setSteps((rs) => [r, ...rs].slice(0, 12))
    } catch (e) {
      setError(String(e))
    } finally {
      setTiming(false)
    }
  }

  const time = async () => {
    if (!lab) return
    setTiming(true)
    try {
      const r = await lab.bench(120)
      setResults((rs) => [r, ...rs].slice(0, 12))
    } catch (e) {
      setError(String(e))
    } finally {
      setTiming(false)
    }
  }

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
        <div>
          <h1 className="font-display text-3xl text-ink">Engine lab</h1>
          <p className="mt-1 max-w-[65ch] text-ink-muted">A blob fox, drawn by Blobscape's own engine or by three.js's built-in splat renderer, and timed. Open it on a phone and press Time it.</p>
        </div>
        <div className="case relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-[#0d0f16] sm:aspect-[16/9]">
          <canvas key={`${opts.which}-${opts.webgl}-${opts.count}-${opts.herd}`} ref={canvas} className="h-full w-full touch-none" aria-label="A blob fox trotting on the spot" />
          <p className="absolute bottom-2.5 left-3 text-sm text-white/70" aria-live="polite">{error ? `Couldn't start: ${error}` : lab ? lab.info : 'Starting…'}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Renderer">
            <div className="flex flex-wrap gap-2">
              <Chip active={opts.which === 'engine' && !opts.webgl} onClick={() => set({ which: 'engine', webgl: false })}>Ours, WebGPU</Chip>
              <Chip active={opts.which === 'engine' && opts.webgl} onClick={() => set({ which: 'engine', webgl: true })}>Ours, WebGL</Chip>
              <Chip active={opts.which === 'three'} onClick={() => set({ which: 'three', webgl: false })}>three.js (can't walk)</Chip>
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
            <Button primary disabled={!lab || working} onClick={time}>{timing ? 'Timing…' : 'Time it'}</Button>
            <Button disabled={!lab || working} onClick={timeSteps}>Time each step</Button>
            <Button onClick={() => downloadGlb(20000)}>Download the fox (.glb)</Button>
            <Button disabled={!lab || working} onClick={makeSheet}>{making ? 'Drawing…' : 'Make a walk sprite sheet'}</Button>
          </div>
        </div>
        {sheet && (
          <section aria-label="Walk sprite sheet" className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-ink">Walk sprite sheet</h2>
            <p className="text-sm text-ink-muted">Four rows (down, left, right, up), eight frames per stride, in Tinkerkit's format.</p>
            <img src={sheet.url} alt="The blob fox's trot, eight frames from each of four sides, as pixel art" className="w-full max-w-xl rounded border border-rule bg-[#0d0f16] p-2 [image-rendering:pixelated]" />
            <div className="flex gap-2">
              <a href={sheet.url} download="blob-fox.png" className="text-accent underline">Download PNG</a>
              <a href={`data:application/json,${encodeURIComponent(sheet.json)}`} download="blob-fox.json" className="text-accent underline">Download JSON</a>
            </div>
          </section>
        )}
        {steps.length > 0 && (
          <section aria-labelledby="steps-title" className="flex flex-col gap-2">
            <h2 id="steps-title" className="text-lg font-semibold text-ink">Each step</h2>
            <p className="text-sm text-ink-muted">
              Milliseconds per step of a walking frame, each waited for on its own (median of 20).
              Move, project and sort run on the GPU with WebGPU; with WebGL each blob is moved as it's drawn, and the CPU moves centres and sorts.
            </p>
            <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" aria-labelledby="steps-title">
              <thead><tr className="text-ink-faint"><th className="py-1 pr-3 font-medium">Renderer</th><th className="pr-3 font-medium">Blobs</th><th className="pr-3 font-medium">Move</th><th className="pr-3 font-medium">Project</th><th className="pr-3 font-medium">Sort</th><th className="pr-3 font-medium">Draw</th><th className="font-medium">CPU (move, sort)</th></tr></thead>
              <tbody>
                {steps.map((r, i) => (
                  <tr key={i} className="border-t border-rule">
                    <td className="py-1 pr-3">{r.which === 'three' ? 'three.js' : 'Ours'} · {r.backend}</td>
                    <td className="pr-3">{r.blobs.toLocaleString()}</td>
                    <td className="pr-3">{r.backend === 'webgpu' && r.which === 'engine' ? r.deform.toFixed(1) : '–'}</td>
                    <td className="pr-3">{r.backend === 'webgpu' && r.which === 'engine' ? r.project.toFixed(1) : '–'}</td>
                    <td className="pr-3">{r.backend === 'webgpu' && r.which === 'engine' ? r.order.toFixed(1) : '–'}</td>
                    <td className="pr-3">{r.draw.toFixed(1)}</td>
                    <td>{r.backend === 'webgl' && r.which === 'engine' ? `${r.cpuSkin.toFixed(1)}, ${r.cpuSort.toFixed(1)}` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </section>
        )}
        {results.length > 0 && (
          <section aria-labelledby="frames-title" className="flex flex-col gap-2">
            <h2 id="frames-title" className="text-lg font-semibold text-ink">Frames</h2>
            <p className="text-sm text-ink-muted">
              Frames per second and milliseconds between frames over 120 live frames; your screen caps this at its refresh rate (60 Hz is 16.7 ms).
              Dropped counts frames that missed a refresh. Alone is one frame drawn and waited for by itself, which stops the CPU and GPU overlapping, so it overstates the cost.
            </p>
            <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" aria-labelledby="frames-title">
              <thead><tr className="text-ink-faint"><th className="py-1 pr-3 font-medium">Renderer</th><th className="pr-3 font-medium">Blobs</th><th className="pr-3 font-medium">fps</th><th className="pr-3 font-medium">Dropped</th><th className="pr-3 font-medium">ms between frames (median / slowest 10%)</th><th className="pr-3 font-medium">ms alone</th><th className="font-medium">ms CPU</th></tr></thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-t border-rule">
                    <td className="py-1 pr-3">{r.which === 'three' ? 'three.js' : 'Ours'} · {r.backend} · {r.moving ? 'walking' : 'standing still'}</td>
                    <td className="pr-3">{r.blobs.toLocaleString()}</td>
                    <td className="pr-3">{r.fps ? r.fps.toFixed(0) : '–'}</td>
                    <td className="pr-3">{r.fps ? `${Math.round(r.dropped * 100)}%` : '–'}</td>
                    <td className="pr-3">{r.fps ? `${r.median.toFixed(1)} / ${r.p90.toFixed(1)}` : '–'}</td>
                    <td className="pr-3">{r.alone.toFixed(1)}</td>
                    <td>{r.cpu.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </section>
        )}
      </main>
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
