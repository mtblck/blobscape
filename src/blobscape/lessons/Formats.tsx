import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { PackedSplats, writeSpz } from '@sparkjsdev/spark'
import { Blobs } from '../../splat-core/blobs.ts'
import { hash01 } from '../../splat-core/effects.ts'
import { flipUpright, frame, sitOnFloor } from '../../splat-core/ops.ts'
import { ImportError, readSplatFile } from '../../splat-core/importer.ts'
import { writePly } from '../../splat-core/ply.ts'
import { PRESETS } from '../../splat-core/presets.ts'
import { blobsFromPreset } from '../../splat-core/shapes.ts'
import type { Orbit } from '../../splat-core/view.ts'
import { Button, Chip, Slider } from '../../shared/ui.tsx'
import { LessonShell } from '../Shell.tsx'
import { LESSON_GOALS } from '../routes.ts'
import { Viewport } from '../Viewport.tsx'
import { useGoals } from '../progress.ts'

type Format = 'ply' | 'splat' | 'spz'
const FORMATS: { id: Format; note: string }[] = [
  { id: 'ply', note: 'Every number as a full 4-byte float. Exact, and big.' },
  { id: 'splat', note: 'Position and size as floats, colour and turn squeezed into a byte each. No colour by angle.' },
  { id: 'spz', note: 'Every number packed into a byte or two, then the whole file compressed.' },
]
const START: Orbit = { target: [0, 0.55, 0], distance: 2.3, azimuth: 25, elevation: 18 }
const MAX_OPEN = 300_000
const MAX_FILE_BYTES = 400e6

/** The antimatter.15 .splat layout: 32 bytes a blob. */
function writeSplat(b: Blobs): Uint8Array {
  const out = new Uint8Array(b.count * 32)
  const dv = new DataView(out.buffer)
  const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  for (let i = 0; i < b.count; i++) {
    const o = i * 32
    for (let k = 0; k < 3; k++) dv.setFloat32(o + k * 4, b.centre[i * 3 + k], true)
    for (let k = 0; k < 3; k++) dv.setFloat32(o + 12 + k * 4, b.scale[i * 3 + k], true)
    for (let k = 0; k < 3; k++) out[o + 24 + k] = byte(b.colour[i * 3 + k] * 255)
    out[o + 27] = byte(b.opacity[i] * 255)
    // w, x, y, z, each from −1..1 to a byte
    const q = [b.quat[i * 4 + 3], b.quat[i * 4], b.quat[i * 4 + 1], b.quat[i * 4 + 2]]
    for (let k = 0; k < 4; k++) out[o + 28 + k] = byte(q[k] * 128 + 128)
  }
  return out
}

async function encode(b: Blobs, format: Format): Promise<Uint8Array> {
  if (format === 'ply') return writePly(b)
  if (format === 'splat') return writeSplat(b)
  const p = new PackedSplats({ maxSplats: Math.max(1, b.count) })
  const c = new THREE.Vector3(), s = new THREE.Vector3(), q = new THREE.Quaternion(), col = new THREE.Color()
  for (let i = 0; i < b.count; i++) {
    c.fromArray(b.centre, i * 3); s.fromArray(b.scale, i * 3); q.fromArray(b.quat, i * 4)
    col.setRGB(b.colour[i * 3], b.colour[i * 3 + 1], b.colour[i * 3 + 2])
    p.pushSplat(c, s, q, b.opacity[i], col)
  }
  const { fileBytes } = await writeSpz(p, { maxSh: 0 })
  p.dispose()
  return fileBytes
}

const kb = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`)

export function Formats() {
  const [orbit, setOrbit] = useState<Orbit>(START)
  const [format, setFormat] = useState<Format>('ply')
  const [keep, setKeep] = useState(1)
  const [source, setSource] = useState(() => ({ blobs: blobsFromPreset(PRESETS[0]), name: 'Toadstool', size: 0 }))
  const [sizes, setSizes] = useState<Partial<Record<Format, number>>>({})
  const [shown, setShown] = useState<Blobs | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const kept = useMemo(() => {
    const b = new Blobs(source.blobs.count)
    for (let i = 0; i < source.blobs.count; i++) if (keep >= 1 || hash01(i, 7) < keep) b.push(source.blobs.get(i))
    return b
  }, [source, keep])

  // Write all three files (so each chip can show its size), and show the chosen one read back
  useEffect(() => {
    let live = true
    const t = setTimeout(async () => {
      try {
        const files = await Promise.all(FORMATS.map((f) => encode(kept, f.id)))
        if (!live) return
        setSizes(Object.fromEntries(FORMATS.map((f, k) => [f.id, files[k].length])))
        const k = FORMATS.findIndex((f) => f.id === format)
        const back = format === 'ply' ? kept : (await readSplatFile(files[k].slice().buffer, `scene.${format}`)).blobs
        if (live) setShown(back)
      } catch (err) {
        console.warn(err)
        if (live) setError('Writing that file failed in this browser.')
      }
    }, 150)
    return () => { live = false; clearTimeout(t) }
  }, [kept, format])

  const size = sizes[format]
  const done = useGoals('formats', {
    smallest: format === 'spz' && !!sizes.spz,
    small: size !== undefined && size < 150_000 && kept.count > 0,
    patchy: keep < 0.2,
  })

  const open = async (file: File) => {
    setError('')
    setBusy(true)
    try {
      if (file.size > MAX_FILE_BYTES) throw new ImportError('too-big', `It's ${(file.size / 1e6).toFixed(0)} MB; this lesson opens files up to ${MAX_FILE_BYTES / 1e6} MB. The sandbox takes bigger ones.`)
      const { blobs, step } = await readSplatFile(await file.arrayBuffer(), file.name, MAX_OPEN)
      if (!blobs.count) throw new ImportError('damaged', 'It has no blobs in it.')
      flipUpright(blobs)
      sitOnFloor(blobs)
      setSource({ blobs, name: file.name + (step > 1 ? ` (1 blob in ${step} kept)` : ''), size: file.size })
      setOrbit((o) => ({ ...o, ...frame(blobs) }))
    } catch (err) {
      setError(err instanceof ImportError ? err.message : 'That file could not be opened.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <LessonShell
      id="formats"
      intro={<p>Real splats are trained from photos and handed around as files. What's actually in one of those files, and how small can it get?</p>}
      view={
        <Viewport
          bare
          blobs={shown ?? kept}
          version={0}
          orbit={orbit}
          setOrbit={setOrbit}
          label={`${source.name}, read back from a .${format} file. Drag or use the arrow keys to orbit.`}
          hint="drag to orbit · scroll to zoom"
        />
      }
      caption={
        <p data-testid="file-readout">
          <span className="text-ink">{source.name}</span> as <span className="text-ink">.{format}</span>:{' '}
          <span className="tabular-nums text-ink">{size !== undefined ? kb(size) : '…'}</span>
          {size !== undefined && kept.count > 0 && <> for <span className="tabular-nums">{kept.count.toLocaleString()}</span> blobs, <span className="tabular-nums text-ink">{(size / kept.count).toFixed(1)}</span> bytes each</>}.
          {source.size > 0 && <> Your original file was {kb(source.size)}.</>}
        </p>
      }
      groups={[
        {
          id: 'format',
          title: 'Save as',
          note: 'then read back and shown',
          span: 3,
          content: (
            <>
              <div className="flex flex-wrap gap-2" role="group" aria-label="File format">
                {FORMATS.map((f) => (
                  <Chip key={f.id} active={format === f.id} onClick={() => setFormat(f.id)}>
                    .{f.id} <span className="tabular-nums font-normal">{sizes[f.id] !== undefined ? kb(sizes[f.id]!) : ''}</span>
                  </Chip>
                ))}
              </div>
              <p className="text-sm text-ink-faint">{FORMATS.find((f) => f.id === format)!.note}</p>
            </>
          ),
        },
        {
          id: 'keep',
          title: 'Blobs',
          note: 'how many go in the file',
          span: 2,
          content: <Slider label="Keep" value={keep} min={0.02} max={1} step={0.01} onChange={setKeep} format={(v) => `${Math.round(v * 100)}%`} />,
        },
        {
          id: 'open',
          title: 'Your own',
          note: '.ply, .spz, .splat, .ksplat or .sog',
          span: 2,
          content: (
            <>
              <input ref={fileRef} type="file" accept=".ply,.spz,.splat,.ksplat,.sog" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void open(f); e.target.value = '' }} />
              <div><Button small disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Opening…' : 'Open a capture'}</Button></div>
              <p role="alert" className="text-sm text-accent-ink empty:hidden">{error}</p>
            </>
          ),
        },
      ]}
      goals={LESSON_GOALS['formats']}
      done={done}
      scene={() => shown ?? kept}
      explainTitle="A file is a list of blobs"
      explain={
        <>
          <p>
            A real capture starts as a few hundred photos of a place. Training scatters blobs, renders them, compares the picture with
            each photo and nudges every blob's numbers until they match: the same loop <a href="/tools/fit-a-picture/" className="text-ink underline underline-offset-2 hover:text-accent">Fit a Picture</a> runs on a single image.
          </p>
          <p>
            What comes out is just the list: each blob's 14 numbers, plus 45 more for colour by angle. A .ply stores every one as a
            4-byte float, so a full capture runs to 248 bytes a blob; this one skips colour by angle, so it's 56. The other formats squeeze
            the numbers into bytes and compress them, which is how .spz got to about a tenth of the size and still looked the same.
          </p>
          <p>
            Squeezing the numbers barely shows. Dropping blobs does: the cap went patchy because nothing filled the gaps. Training avoids
            that by adding blobs where detail needs them and removing them where it doesn't.
          </p>
        </>
      }
    />
  )
}
