import { askRedraw, isDrawnTo, watchDraws } from '../splat-core/drawn.ts'

/**
 * Records a preview as a video: the Record button on every experiment's view (Workbench). Only what is drawn is
 * recorded: every canvas in the view, laid over the colors behind them, as they stand on the page. Buttons, hints and
 * anything else that is HTML stay out. It records what happens while it runs (a turned view, a changed look, a new
 * season), each frame at its own time, so a slow moment is slow in the video and nothing speeds up.
 *
 * The file is an MP4 (the browser's own H.264 through WebCodecs, as the sandbox's camera path) where the browser
 * can make one, and otherwise whatever its MediaRecorder writes (WebM in most).
 */

/** Frames a second, at most: a frame is taken only when the page has drawn one. */
export const RECORD_FPS = 30
/** A recording stops by itself after this many seconds: the file is built in memory. */
export const RECORD_MOST = 180
/** The video's long side, at most, in pixels. */
const SIDE = 1920

export interface Box { x: number; y: number; w: number; h: number }

/** Where a box of the view lands in the video: the view fitted whole into `W` by `H` and centered (a view that changes shape mid-recording keeps its proportions). */
export function fitInto(view: Box, part: Box, W: number, H: number): Box {
  let kx = Math.min(W / view.w, H / view.h), ky = kx
  // the video's sides are whole even numbers, so a view of the same shape can miss an edge by a pixel: fill it
  if (Math.abs(W - view.w * kx) < 2 && Math.abs(H - view.h * ky) < 2) { kx = W / view.w; ky = H / view.h }
  const ox = (W - view.w * kx) / 2, oy = (H - view.h * ky) / 2
  return { x: ox + (part.x - view.x) * kx, y: oy + (part.y - view.y) * ky, w: part.w * kx, h: part.h * ky }
}

/** The video's size for a view `w` by `h` CSS pixels on a screen of `dpr` device pixels each: even numbers, the long side at most `side`. */
export function recordSize(w: number, h: number, dpr: number, side = SIDE): [number, number] {
  const k = Math.min(dpr, side / Math.max(w, h))
  return [Math.max(2, Math.round((w * k) / 2) * 2), Math.max(2, Math.round((h * k) / 2) * 2)]
}

/** A `linear-gradient(…)` as the browser reports it (computed style): its angle in degrees and its colors with their places from 0 to 1. Undefined for anything else. */
export function readGradient(image: string): { angle: number; stops: { color: string; at: number }[] } | undefined {
  const m = /^linear-gradient\((.*)\)$/s.exec(image.trim())
  if (!m) return
  // split on the commas outside brackets
  const parts: string[] = []
  let depth = 0, from = 0
  for (let i = 0; i < m[1].length; i++) {
    const c = m[1][i]
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === ',' && depth === 0) { parts.push(m[1].slice(from, i).trim()); from = i + 1 }
  }
  parts.push(m[1].slice(from).trim())
  let angle = 180
  const first = parts[0]
  const deg = /^(-?[\d.]+)deg$/.exec(first)
  const SIDES: Record<string, number> = { 'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270 }
  if (deg) { angle = Number(deg[1]); parts.shift() } else if (first in SIDES) { angle = SIDES[first]; parts.shift() } else if (first.startsWith('to ')) return
  const stops = parts.map((p) => {
    const at = /\s(-?[\d.]+)%$/.exec(p)
    return { color: at ? p.slice(0, at.index).trim() : p, at: at ? Number(at[1]) / 100 : NaN }
  })
  if (stops.length < 2 || stops.some((s) => !s.color)) return
  // stops with no place are spread evenly between the ones that have one
  if (Number.isNaN(stops[0].at)) stops[0].at = 0
  if (Number.isNaN(stops[stops.length - 1].at)) stops[stops.length - 1].at = 1
  for (let i = 1; i < stops.length - 1; i++) {
    if (!Number.isNaN(stops[i].at)) continue
    let j = i
    while (Number.isNaN(stops[j].at)) j++
    for (let k = i; k < j; k++) stops[k].at = stops[i - 1].at + ((stops[j].at - stops[i - 1].at) * (k - i + 1)) / (j - i + 1)
    i = j
  }
  return { angle, stops: stops.map((s) => ({ color: s.color, at: Math.min(1, Math.max(0, s.at)) })) }
}

/** A file name for a recording made on the page at `path`, at `when`. */
export function recordName(path: string, when: Date, ext: string): string {
  const page = path.split('/').filter(Boolean).pop()?.replace(/[^\w-]+/g, '-') || 'blobscape'
  const two = (n: number) => String(n).padStart(2, '0')
  return `blobscape-${page}-${when.getFullYear()}${two(when.getMonth() + 1)}${two(when.getDate())}-${two(when.getHours())}${two(when.getMinutes())}${two(when.getSeconds())}.${ext}`
}

export interface Recorded { bytes: Blob; ext: 'mp4' | 'webm' }

export interface Recording {
  /** Seconds recorded so far. */
  readonly seconds: number
  /** Ends it and gives the file. */
  stop(): Promise<Recorded>
  /** Ends it and throws the frames away. */
  cancel(): void
}

const clear = (color: string) => !color || color === 'transparent' || /rgba\(.*,\s*0\)$/.test(color) || /\/\s*0\)$/.test(color)

/** Paints an element's own background (a flat color, a linear gradient) into `at`. */
function paintGround(ctx: CanvasRenderingContext2D, style: CSSStyleDeclaration, at: Box) {
  if (!clear(style.backgroundColor)) {
    ctx.fillStyle = style.backgroundColor
    ctx.fillRect(at.x, at.y, at.w, at.h)
  }
  const g = style.backgroundImage && style.backgroundImage !== 'none' ? readGradient(style.backgroundImage) : undefined
  if (!g) return
  // CSS's gradient line: through the middle at the angle (0 is up), long enough that the corners take the end colors
  const a = (g.angle * Math.PI) / 180, dx = Math.sin(a), dy = -Math.cos(a)
  const half = (Math.abs(at.w * dx) + Math.abs(at.h * dy)) / 2
  const cx = at.x + at.w / 2, cy = at.y + at.h / 2
  const fill = ctx.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half)
  try { for (const s of g.stops) fill.addColorStop(s.at, s.color) } catch { return }
  ctx.fillStyle = fill
  ctx.fillRect(at.x, at.y, at.w, at.h)
}

/** The nearest color behind an element: its own or the first ancestor's that has one. */
function colorBehind(el: Element): string {
  for (let e: Element | null = el; e; e = e.parentElement) {
    const c = getComputedStyle(e).backgroundColor
    if (!clear(c)) return c
  }
  return '#000'
}

const boxOf = (r: DOMRect): Box => ({ x: r.left, y: r.top, w: r.width, h: r.height })

/**
 * Draws `view` as it stands onto a `W` by `H` sheet: every canvas inside it, in page order, over the colors behind
 * them. Nothing that is HTML is drawn. `pictureOf` gives what to draw for a canvas (a copy kept from its last draw,
 * or the canvas itself straight after one); undefined leaves it out.
 */
export function paintView(ctx: CanvasRenderingContext2D, view: HTMLElement, W: number, H: number, pictureOf: (canvas: HTMLCanvasElement) => HTMLCanvasElement | undefined) {
  const whole = boxOf(view.getBoundingClientRect())
  if (whole.w < 2 || whole.h < 2) return
  ctx.globalAlpha = 1
  ctx.fillStyle = colorBehind(view)
  ctx.fillRect(0, 0, W, H)
  ctx.save()
  const frame = fitInto(whole, whole, W, H)
  ctx.beginPath()
  ctx.rect(frame.x, frame.y, frame.w, frame.h)
  ctx.clip()
  // in the page's own order: what comes later lies on top
  for (const el of view.querySelectorAll('*')) {
    const isCanvas = el instanceof HTMLCanvasElement
    // a ground is the color behind a canvas: something that holds one, or an empty box put behind them for show
    const holds = !isCanvas && !!el.querySelector('canvas')
    if (!isCanvas && !holds && !(el.getAttribute('aria-hidden') === 'true' && !el.firstElementChild && !el.textContent)) continue
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) continue
    // an empty box is a backdrop only if it is a good part of the view (a button's dot is not)
    if (!isCanvas && !holds && r.width * r.height < 0.25 * whole.w * whole.h) continue
    const style = getComputedStyle(el)
    if (style.visibility === 'hidden' || style.display === 'none') continue
    const at = fitInto(whole, boxOf(r), W, H)
    if (!isCanvas) { paintGround(ctx, style, at); continue }
    const from = pictureOf(el)
    if (!from || !from.width || !from.height) continue
    paintGround(ctx, style, at)
    ctx.globalAlpha = Number(style.opacity) || (style.opacity === '0' ? 0 : 1)
    ctx.imageSmoothingEnabled = !/pixelated|crisp-edges/.test(style.imageRendering)
    ctx.imageSmoothingQuality = 'high'
    try { ctx.drawImage(from, at.x, at.y, at.w, at.h) } catch { /* a canvas that can't be read is left out */ }
    ctx.globalAlpha = 1
  }
  ctx.restore()
}

/**
 * Starts recording the canvases inside `view`. `kind` forces the file type (the page's `?record=webm`, which the
 * browser checks use: headless Chromium claims H.264 and never delivers). `onEnd` is called if it stops by itself
 * (at `RECORD_MOST` seconds, or when the encoder fails), with the file or the error.
 */
export async function startRecording(view: HTMLElement, opts: { kind?: 'mp4' | 'webm'; onEnd?: (r: Recorded | Error) => void } = {}): Promise<Recording> {
  const first = view.getBoundingClientRect()
  if (first.width < 2 || first.height < 2) throw new Error('there is nothing to record yet')
  const [W, H] = recordSize(first.width, first.height, window.devicePixelRatio || 1)
  const sheet = document.createElement('canvas')
  sheet.width = W
  sheet.height = H
  const ctx = sheet.getContext('2d', { alpha: false })!

  // the last picture of every canvas a GPU draws to, copied in the moment after each draw (see drawn.ts)
  const kept = new Map<HTMLCanvasElement, HTMLCanvasElement>()
  const unwatch = watchDraws((canvas) => {
    if (!view.contains(canvas) || !canvas.width || !canvas.height) return
    let copy = kept.get(canvas)
    if (!copy) kept.set(canvas, (copy = document.createElement('canvas')))
    if (copy.width !== canvas.width || copy.height !== canvas.height) { copy.width = canvas.width; copy.height = canvas.height }
    const c = copy.getContext('2d')!
    c.globalCompositeOperation = 'copy'
    c.drawImage(canvas, 0, 0)
  })
  for (const canvas of view.querySelectorAll('canvas')) askRedraw(canvas)

  /** Draws the view as it stands onto the sheet. */
  const compose = () => paintView(ctx, view, W, H, (el) => (isDrawnTo(el) ? kept.get(el) : el))

  let writer: Awaited<ReturnType<typeof import('../blobscape/diorama/video.ts').startVideo>> | undefined
  let media: MediaRecorder | undefined
  const chunks: Blob[] = []
  if (opts.kind !== 'webm') {
    try {
      const { startVideo } = await import('../blobscape/diorama/video.ts')
      writer = await startVideo(W, H, RECORD_FPS)
    } catch { /* no H.264 here: the browser's own recorder instead */ }
  }
  if (!writer) {
    if (typeof MediaRecorder === 'undefined' || !sheet.captureStream) { unwatch(); throw new Error('this browser cannot record video') }
    const type = (opts.kind === 'webm' ? [] : ['video/mp4;codecs=avc1.640034', 'video/mp4']).concat(['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']).find((t) => MediaRecorder.isTypeSupported(t))
    media = new MediaRecorder(sheet.captureStream(RECORD_FPS), { mimeType: type, videoBitsPerSecond: Math.min(40e6, W * H * RECORD_FPS * 0.15) })
    media.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data) }
  }

  let raf = 0, ended = false, busy = false, seconds = 0, failed: unknown
  // the first frame taken is the video's time 0
  let began: number | undefined
  let last = -Infinity
  const finish = async (): Promise<Recorded> => {
    ended = true
    cancelAnimationFrame(raf)
    unwatch()
    if (failed) throw failed
    if (writer) return { bytes: new Blob([(await writer.finish()) as Uint8Array<ArrayBuffer>], { type: 'video/mp4' }), ext: 'mp4' }
    const m = media!
    await new Promise<void>((done) => { m.onstop = () => done(); m.stop() })
    m.stream.getTracks().forEach((t) => t.stop())
    return { bytes: new Blob(chunks, { type: m.mimeType }), ext: m.mimeType.includes('mp4') ? 'mp4' : 'webm' }
  }
  const endByItself = () => { if (!ended) finish().then((r) => opts.onEnd?.(r), (e: unknown) => opts.onEnd?.(e instanceof Error ? e : new Error(String(e)))) }
  const tick = (now: number) => {
    if (ended) return
    raf = requestAnimationFrame(tick)
    const at = began === undefined ? 0 : (now - began) / 1000
    // a frame in hand is still being taken in by the encoder: this one is skipped, and the video keeps its time
    if (busy || now - last < 1000 / RECORD_FPS - 2) return
    if (at >= RECORD_MOST) { endByItself(); return }
    last = now
    began ??= now
    seconds = at
    compose()
    if (!writer) return
    busy = true
    writer.add(sheet, at).then(() => { busy = false }, (e: unknown) => { failed = e; endByItself() })
  }
  compose()
  media?.start(1000)
  // after the stages' own frame callbacks, which were asked for before this one
  raf = requestAnimationFrame(tick)

  return {
    get seconds() { return seconds },
    stop: finish,
    cancel() {
      ended = true
      cancelAnimationFrame(raf)
      unwatch()
      if (media && media.state !== 'inactive') { media.stop(); media.stream.getTracks().forEach((t) => t.stop()) }
      // the encoder is closed by finishing; what it made is dropped
      void writer?.finish().catch(() => {})
    },
  }
}
