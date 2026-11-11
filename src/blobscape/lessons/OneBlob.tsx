import { useMemo, useState } from 'react'
import { Blobs, hexToRgb, quatFromEuler } from '../../splat-core/blobs.ts'
import type { Orbit } from '../../splat-core/view.ts'
import { Chip, Field, Slider, Tabs, Toggle } from '../../shared/ui.tsx'
import { LessonShell } from '../Shell.tsx'
import { LESSON_GOALS } from '../routes.ts'
import { Viewport } from '../Viewport.tsx'
import { drawOutlines, themeColour } from '../overlay.ts'
import { useGoals } from '../progress.ts'

const SWATCHES = ['#e5484d', '#f2a65a', '#f5d90a', '#30a46c', '#3e9be0', '#8e4ec6', '#f4ede1']

// Scales are on a log slider: blobs range from needles to pancakes, and halving feels the same at any size.
const logFmt = (v: number) => (2 ** v).toFixed(2)

export function OneBlob() {
  const [sx, setSx] = useState(-1)
  const [sy, setSy] = useState(-1)
  const [sz, setSz] = useState(-1)
  const [rx, setRx] = useState(0)
  const [ry, setRy] = useState(0)
  const [rz, setRz] = useState(0)
  const [opacity, setOpacity] = useState(0.9)
  const [colour, setColour] = useState('#f2a65a')
  const [xray, setXray] = useState(true)
  const [orbit, setOrbit] = useState<Orbit>({ target: [0, 0, 0], distance: 4, azimuth: 30, elevation: 20 })

  const scale = [2 ** sx, 2 ** sy, 2 ** sz]
  const blobs = useMemo(() => {
    const b = new Blobs(1)
    b.push({ centre: [0, 0, 0], scale: [scale[0], scale[1], scale[2]], quat: quatFromEuler(rx, ry, rz), colour: hexToRgb(colour), opacity })
    return b
    // scale is derived from sx/sy/sz
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sx, sy, sz, rx, ry, rz, opacity, colour])

  const sorted = [...scale].sort((a, b) => a - b)
  const done = useGoals('one-blob', {
    pancake: sorted[0] < sorted[1] / 8,
    needle: sorted[2] > sorted[1] * 6,
    ghost: opacity > 0 && opacity <= 0.15,
    tilt: rx !== 0 || ry !== 0 || rz !== 0,
  })

  return (
    <LessonShell
      id="one-blob"
      intro={<p>Every splat scene, however detailed, is made of this one thing: a soft, coloured, see-through blob. Here's a single one.</p>}
      view={
        <Viewport
          blobs={blobs}
          version={0}
          orbit={orbit}
          setOrbit={setOrbit}
          label="A single Gaussian blob. Drag or use the arrow keys to orbit; scroll or press plus and minus to zoom."
          hint="drag to orbit · scroll to zoom"
          overlay={xray ? (ctx, lens) => drawOutlines(ctx, blobs, lens, { sigmas: [1, 2], colour: themeColour('ink-faint'), axes: true }) : undefined}
        />
      }
      caption={
        <p>
          {xray ? (
            <>The rings are where the blob fades to 61% and 14% of its strength (1σ and 2σ). The coloured lines are its own <span style={{ color: '#e5484d' }}>x</span>, <span style={{ color: '#30a46c' }}>y</span> and <span style={{ color: '#3e63dd' }}>z</span> axes.</>
          ) : 'Turn on x-ray to see the outline of the Gaussian.'}
        </p>
      }
      controls={
        <>
        <div className="flex flex-wrap items-center gap-2">
          <Toggle label="X-ray" checked={xray} onChange={setXray} />
          <span aria-hidden className="mx-1 h-4 w-px bg-rule" />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick shapes">
            <Chip small onClick={() => { setSx(-1); setSy(-1); setSz(-1) }}>Round</Chip>
            <Chip small onClick={() => { setSx(-0.5); setSy(-0.5); setSz(-4) }}>Pancake</Chip>
            <Chip small onClick={() => { setSx(0.3); setSy(-3.5); setSz(-3.5) }}>Needle</Chip>
          </div>
        </div>
        <Tabs
          label="Blob settings"
          tabs={[
            {
              id: 'shape',
              label: 'Size',
              summary: scale.map((s) => s.toFixed(2)).join(' × '),
              content: (
                <div className="space-y-3">
                  <Slider label="Size along x" value={sx} min={-5} max={1} step={0.05} onChange={setSx} format={logFmt} />
                  <Slider label="Size along y" value={sy} min={-5} max={1} step={0.05} onChange={setSy} format={logFmt} />
                  <Slider label="Size along z" value={sz} min={-5} max={1} step={0.05} onChange={setSz} format={logFmt} hint="Each is one standard deviation along the blob's own axis. Three of them make an ellipsoid." />
                </div>
              ),
            },
            {
              id: 'turn',
              label: 'Turn',
              summary: `${rx}° ${ry}° ${rz}°`,
              content: (
                <div className="space-y-3">
                  <Slider label="Tip forward (x)" value={rx} min={-180} max={180} step={1} onChange={setRx} format={(v) => `${v}°`} />
                  <Slider label="Spin (y)" value={ry} min={-180} max={180} step={1} onChange={setRy} format={(v) => `${v}°`} />
                  <Slider label="Roll (z)" value={rz} min={-180} max={180} step={1} onChange={setRz} format={(v) => `${v}°`} hint="Stored as a quaternion: four numbers that describe any rotation without the gimbal problems of angles." />
                </div>
              ),
            },
            {
              id: 'look',
              label: 'Look',
              summary: `${Math.round(opacity * 100)}% opaque`,
              content: (
                <div className="space-y-3">
                  <Field label="Colour">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {SWATCHES.map((c) => (
                        <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={colour === c} onClick={() => setColour(c)} className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${colour === c ? 'border-ink' : 'border-transparent'}`} style={{ background: c }} />
                      ))}
                      <input type="color" aria-label="Any colour" value={colour} onChange={(e) => setColour(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-rule bg-transparent" />
                    </div>
                  </Field>
                  <Slider label="Opacity" value={opacity} min={0} max={1} step={0.01} onChange={setOpacity} format={(v) => `${Math.round(v * 100)}%`} hint="How much of what's behind it the blob covers at its very centre. It fades out from there." />
                </div>
              ),
            },
          ]}
        />
        </>
      }
      goals={LESSON_GOALS['one-blob']}
      done={done}
      scene={() => blobs}
      explain={
        <>
          <p>
            A Gaussian splat is a cloud of these. Each one is described by a handful of numbers: a <strong className="text-ink">position</strong> (3),
            a <strong className="text-ink">size</strong> along each of its own axes (3), a <strong className="text-ink">rotation</strong> (4, as a quaternion),
            a <strong className="text-ink">colour</strong> (3) and an <strong className="text-ink">opacity</strong> (1). That's 14 numbers, or about 56 bytes.
          </p>
          <p>
            It's called Gaussian because its strength falls off like the bell curve: full at the centre, about 61% one standard deviation
            out, 14% at two, and practically nothing past three. There's no hard edge, which is why splat scenes look soft and photographic
            rather than polygonal.
          </p>
          <p>
            Real captures rarely use round blobs. Most end up as flat pancakes lying on the surface of whatever they describe, which is
            the next thing worth seeing: what one looks like from different angles.
          </p>
        </>
      }
    />
  )
}
