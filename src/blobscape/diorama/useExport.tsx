import { useRef, useState, type ReactNode, type RefObject } from 'react'
import type { Orbit } from '../../splat-core/view.ts'
import type { Frame } from '../../splat-core/pixel.ts'
import { browserDeflate, encodeApng, enlarged, startApng } from '../../splat-core/apng.ts'
import { watchDraws } from '../../splat-core/drawn.ts'
import { glitchArt } from '../../splat-core/glitch.ts'
import { paintView } from '../../shared/record.ts'
import { Chip, Field } from '../../shared/ui.tsx'
import type { CreatureStage } from '../creature/stage.ts'
import { download } from '../files.ts'
import { kilobytes } from './SceneDetails.tsx'
import { EXPORT_RATES, exportName, exportSize, leadIn, loopTimes, sideFor, sidesFor } from './exportLoop.ts'

/** A frame as a PNG, each art pixel `scale` across. */
export async function toPng(f: Frame, scale: number): Promise<Uint8Array> {
  const one = document.createElement('canvas')
  one.width = f.width
  one.height = f.height
  one.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(f.data), f.width, f.height), 0, 0)
  const big = document.createElement('canvas')
  big.width = f.width * scale
  big.height = f.height * scale
  const ctx = big.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(one, 0, 0, big.width, big.height)
  const blob = await new Promise<Blob | null>((done) => big.toBlob(done, 'image/png'))
  if (!blob) throw new Error('Could not make the PNG')
  return new Uint8Array(await blob.arrayBuffer())
}

/** What a page tells its export about what it draws. */
export interface ExportOn {
  stage: CreatureStage | undefined
  canvas: RefObject<HTMLCanvasElement | null>
  /** Drawn as pixel art underneath (pixel art or tech glitch): the art itself is saved, each pixel a whole square. */
  pixels: boolean
  /** The style's id, for file names. */
  style: string
  /** The scene's id, for file names. */
  name: string
  /** The page, for file names. */
  page?: string
  /** Seconds before the scene repeats. */
  loop: number
  /** The view now: an export holds it. */
  orbit: Orbit
  /** Told when an export pauses the scene and when it hands the scene back. */
  setPlaying?: (on: boolean) => void
}

/** One frame of an export: the scene's moment and, for a camera path, the view then. */
interface Step { t: number; orbit?: Orbit }

/**
 * Saving what a page draws, shared by Pixel Diorama and Scene Creator: a frame as a PNG, one whole loop as an MP4 or
 * an animated PNG stepped a frame at a time from the time so it joins up, or a flight along a camera path. Pixel art
 * saves the art itself; the other styles save the view's own picture. `held` is the view an export holds: a page's
 * poser and its view effect leave `stage.orbit` alone while it is set.
 */
export function useExport(on: ExportOn) {
  const { stage, canvas, pixels, style, name, page, loop, orbit, setPlaying } = on
  const [recording, setRecording] = useState<number | null>(null)
  const [total, setTotal] = useState(0)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')
  /** What an export saves, once the visitor has picked: until then pixel art is a lossless animated PNG and the other styles an MP4. */
  const [asPicked, setRecordAs] = useState<'png' | 'mp4'>()
  const recordAs = asPicked ?? (pixels ? 'png' : 'mp4')
  const [videoSize, setVideoSize] = useState(6)
  const [pngSize, setPngSize] = useState(4)
  /** The long side, in pixels, a style other than pixel art is exported at (an animated PNG takes the smaller ones). */
  const [side, setSide] = useState(1080)
  const [fpsPicked, setRecordFps] = useState(EXPORT_RATES[0])
  // pixel art moves in few, clear steps, so it has no 30
  const rates = pixels ? EXPORT_RATES.slice(0, 2) : EXPORT_RATES
  const fps = rates.includes(fpsPicked) ? fpsPicked : rates[rates.length - 1]
  const held = useRef<Orbit | undefined>(undefined)

  /**
   * The view as it is drawn by a style other than pixel art: its canvas over the color behind it, copied in the moment
   * after a draw (the only time a canvas a GPU draws to can be read). `take` is called with each picture.
   */
  const pictures = (W: number, H: number, take: (sheet: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => void) => {
    const cv = canvas.current!, box = cv.parentElement!
    const sheet = document.createElement('canvas')
    sheet.width = W
    sheet.height = H
    const ctx = sheet.getContext('2d', { alpha: false, willReadFrequently: true })!
    return watchDraws((drawn) => {
      if (drawn !== cv) return
      paintView(ctx, box, W, H, (el) => el)
      take(sheet, ctx)
    })
  }

  /** Draws `steps` one at a time (after `lead`, drawn and thrown away) and saves them as one file. */
  const run = async (steps: Step[], lead: number[], rate: number, what: 'loop' | 'path') => {
    if (!stage || recording !== null) return
    const kind = recordAs, was = stage.playing, count = steps.length
    held.current = steps[0].orbit ?? orbit
    stage.orbit = held.current
    setPlaying?.(false)
    stage.playing = false
    setTotal(count)
    setRecording(0)
    setNote(what === 'loop' ? 'Exporting the loop, one frame at a time…' : 'Exporting the camera path, one frame at a time…')
    let unwatch: (() => void) | undefined
    const at = async (s: Step) => { if (s.orbit) stage.orbit = held.current = s.orbit; await stage.frame(s.t) }
    try {
      // the end of the loop first, so looks that settle against the frame before have what comes before frame 0
      for (const t of lead) await at({ t, orbit: steps[0].orbit })
      let bytes: Uint8Array, W: number, H: number
      if (pixels) {
        const frames: Frame[] = []
        for (let f = 0; f < count; f++) {
          await at(steps[f])
          const got = await stage.pixelFrames()
          if (!got) throw new Error('pixel art went away')
          // the art read back is clean: the glitch drawn over it on screen is laid on again here, by its CPU twin
          frames.push(stage.glitchNow ? glitchArt(got.art, stage.glitchNow) : got.art)
          if (f % 6 === 0) setRecording(f)
        }
        setRecording(count)
        // a camera path can change the art's size as the view zooms: every frame takes the first one's
        const { width: w, height: h } = frames[0]
        const same = frames.every((f) => f.width === w && f.height === h)
        if (!same) throw new Error('the art changed size')
        if (kind === 'mp4') {
          const { encodeVideo, videoScale } = await import('./video.ts')
          const s = videoScale(w, h, videoSize)
          bytes = await encodeVideo(frames, rate, s)
          W = w * s; H = h * s
        } else {
          // each art pixel a square of whole pixels, so a bigger picture is as crisp as the art
          bytes = await encodeApng(frames.map((f) => enlarged(f, pngSize)), rate, browserDeflate)
          W = w * pngSize; H = h * pngSize
        }
      } else {
        const cv = canvas.current!
        ;[W, H] = exportSize(cv.width, cv.height, sideFor(kind, side))
        const video = kind === 'mp4' ? await (await import('./video.ts')).startVideo(W, H, rate) : undefined
        const png = video ? undefined : startApng(W, H, count, rate, browserDeflate)
        // each frame is handed on as soon as it is drawn, so no more than one raw picture is held at a time
        let taken: Promise<void> | undefined
        // the view may also draw by itself between frames (a setting that asked for one): only the frame asked for is taken
        unwatch = pictures(W, H, (sheet, ctx) => { if (!taken) taken = video ? video.add(sheet) : png!.add({ width: W, height: H, data: ctx.getImageData(0, 0, W, H).data }) })
        for (let f = 0; f < count; f++) {
          taken = undefined
          await at(steps[f])
          if (!taken) throw new Error('the view gave no picture')
          await taken
          if (f % 6 === 0) setRecording(f)
        }
        setRecording(count)
        bytes = video ? await video.finish() : png!.finish()
      }
      download(bytes, exportName(name, style, what, kind, page), kind === 'mp4' ? 'video/mp4' : 'image/png')
      setNote(`Saved the ${what === 'loop' ? 'loop' : 'camera path'}: ${count} frames at ${W} × ${H}, ${kind === 'mp4' ? 'an MP4' : 'an animated PNG'} of ${kilobytes(bytes.length)}.`)
    } catch (e) {
      console.warn(e)
      setNote(kind === 'mp4' && String(e).includes('MP4') ? 'This browser can’t make an MP4. The animated PNG works everywhere.'
        : String(e).includes('changed size') ? 'The pixel art changed size along the path. Keep the stops nearer one distance, or save it in another style.'
          : `The ${what === 'loop' ? 'loop' : 'path'} could not be exported. Keep the settings and the window’s size as they are while it runs.`)
    } finally {
      unwatch?.()
      const back = held.current
      held.current = undefined
      setRecording(null)
      // a path leaves the view at its last stop; the page's own view comes back
      if (what === 'path' && back) stage.orbit = orbit
      stage.playing = was
      setPlaying?.(was)
      stage.invalidate()
    }
  }

  /**
   * Exports one whole loop in the style and settings on show, stepped frame by frame from the time so it joins up end
   * to end and no frame is dropped. The view is held as it stands when this is called.
   */
  const record = () => run(loopTimes(loop, fps).map((t) => ({ t })), leadIn(loop, fps), fps, 'loop')

  /** Flies the view along `path` (the view `u` of the way along, 0 to 1) over `seconds`, the scene playing on from now. */
  const recordPath = (path: (u: number) => Orbit, seconds: number) => {
    if (!stage) return Promise.resolve()
    const n = Math.max(2, Math.round(seconds * fps) + 1), t0 = stage.time
    return run(Array.from({ length: n }, (_, f) => ({ t: t0 + f / fps, orbit: path(f / (n - 1)) })), [], fps, 'path')
  }

  /** Saves the picture on show: pixel art as its own pixels four times the size, another style as the view draws it. */
  const save = async () => {
    if (!stage) return
    setSaving(true)
    setNote('')
    let unwatch: (() => void) | undefined
    try {
      if (pixels) {
        const frames = await stage.pixelFrames()
        if (!frames) return
        download(await toPng(stage.glitchNow ? glitchArt(frames.art, stage.glitchNow) : frames.art, 4), exportName(name, style, 'frame', 'png', page), 'image/png')
        setNote(`Saved a ${frames.art.width * 4} × ${frames.art.height * 4} PNG.`)
        return
      }
      const cv = canvas.current!, W = cv.width, H = cv.height
      let got: Promise<Blob | null> | undefined
      unwatch = pictures(W, H, (sheet) => { got ??= new Promise((done) => sheet.toBlob(done, 'image/png')) })
      await stage.frame(stage.time)
      const blob = await got
      if (!blob) throw new Error('the view gave no picture')
      download(new Uint8Array(await blob.arrayBuffer()), exportName(name, style, 'frame', 'png', page), 'image/png')
      setNote(`Saved a ${W} × ${H} PNG.`)
    } catch (e) {
      console.warn(e)
      setNote('The picture could not be saved.')
    } finally {
      unwatch?.()
      setSaving(false)
    }
  }

  /**
   * A small JPEG of the picture on show, its longer side `side` pixels, as a data address: Scene Creator's picture of a
   * saved scene. Nothing is downloaded, and it gives nothing while an export runs or the view gives no picture.
   */
  const snapshot = async (side: number): Promise<string | undefined> => {
    if (!stage || held.current) return
    let unwatch: (() => void) | undefined
    try {
      let from: CanvasImageSource, W: number, H: number
      if (pixels) {
        const frames = await stage.pixelFrames()
        if (!frames) return
        const art = frames.art
        const one = document.createElement('canvas')
        one.width = W = art.width
        one.height = H = art.height
        one.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(art.data), W, H), 0, 0)
        from = one
      } else {
        const cv = canvas.current!
        W = cv.width
        H = cv.height
        let got: HTMLCanvasElement | undefined
        unwatch = pictures(W, H, (sheet) => { got ??= sheet })
        await stage.frame(stage.time)
        if (!got) return
        from = got
      }
      const k = side / Math.max(W, H)
      const small = document.createElement('canvas')
      small.width = Math.max(1, Math.round(W * k))
      small.height = Math.max(1, Math.round(H * k))
      const ctx = small.getContext('2d')!
      // the art's own pixels stay square; a painted view is smoothed down
      ctx.imageSmoothingEnabled = !pixels || k < 1
      ctx.fillStyle = getComputedStyle(canvas.current!.parentElement!).backgroundColor || '#000'
      ctx.fillRect(0, 0, small.width, small.height)
      ctx.drawImage(from, 0, 0, small.width, small.height)
      return small.toDataURL('image/jpeg', 0.8)
    } catch (e) {
      console.warn(e)
      return
    } finally {
      unwatch?.()
    }
  }

  /** What an export saves and how big: an Export tab's choices, and the same ones in the full screen view's Export popup. */
  const choices = (inFull: boolean): ReactNode => (
    <div className="grid gap-3">
      <Field label="Save as">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={recordAs === 'png'} onClick={() => setRecordAs('png')}>Animated PNG</Chip>
          <Chip active={recordAs === 'mp4'} onClick={() => setRecordAs('mp4')}>MP4 video</Chip>
        </div>
        {!pixels && recordAs === 'png' && <p className="mt-1.5 text-xs text-ink-faint">Lossless, so the file is large for this style. An MP4 is far smaller and can be bigger across.</p>}
      </Field>
      <Field label="Frames a second">
        <div className="flex flex-wrap gap-1.5">
          {rates.map((r) => <Chip key={r} active={fps === r} onClick={() => setRecordFps(r)}>{String(r)}</Chip>)}
        </div>
        <p className="mt-1.5 text-xs text-ink-faint">More frames take longer to export and suit a scene where things move fast.</p>
      </Field>
      {pixels && recordAs === 'png' && <Field label="Picture size">
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 4, 6].map((s) => <Chip key={s} active={pngSize === s} onClick={() => setPngSize(s)}>{`${s}×`}</Chip>)}
        </div>
        <p className="mt-1.5 text-xs text-ink-faint">How many pixels wide each pixel of the art is saved. 1× is the art's own size.</p>
      </Field>}
      {pixels && recordAs === 'mp4' && <Field label="Video size">
        <div className="flex flex-wrap gap-1.5">
          {[4, 6, 8].map((s) => <Chip key={s} active={videoSize === s} onClick={() => setVideoSize(s)}>{`${s}×`}</Chip>)}
        </div>
        <p className="mt-1.5 text-xs text-ink-faint">How many pixels wide each pixel of the art is in the video.</p>
      </Field>}
      {!pixels && <Field label="Longest side">
        <div className="flex flex-wrap gap-1.5">
          {sidesFor(recordAs).map((s) => <Chip key={s} active={sideFor(recordAs, side) === s} onClick={() => setSide(s)}>{`${s} px`}</Chip>)}
        </div>
        <p className="mt-1.5 text-xs text-ink-faint">{inFull ? 'Never bigger than the view itself, which is as big as it gets in full screen.' : 'Never bigger than the view itself: for a bigger picture, make the view full screen first.'}</p>
      </Field>}
    </div>
  )

  const loopFrames = loopTimes(loop, fps).length
  /** The loop button's words: what it does, or how far it has got. */
  const label = (idle = 'Export the loop') => (recording === null ? idle : recording >= total ? 'Saving…' : `Frame ${recording} of ${total}…`)

  return { held, recording, saving, note, setNote, busy: saving || recording !== null, record, recordPath, save, snapshot, choices, label, fps, loopFrames }
}
