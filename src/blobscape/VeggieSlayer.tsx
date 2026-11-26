import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { Button, Toggle } from '../shared/ui.tsx'
import { TAB_SECTIONS, Workbench } from '../shared/Workbench.tsx'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import type { CreatureStage } from './creature/stage.ts'
import { BLOCK_START, blockLook } from './blockLooks.ts'
import { ShareDialog } from './diorama/ShareDialog.tsx'
import { BEST_KEY, Game, HEARTS, KINDS, kindOf, type GameEvent, type KindId, type Tally } from './veggies/game.ts'
import { CELL, buildDebris, buildVeggies, buildWords, modelOf, PEPPERS } from './veggies/models.ts'
import { Show } from './veggies/view.ts'
import { Sounds } from './veggies/sound.ts'
import { STAGE_FOV } from '../splat-core/orbit.ts'
import { href } from './routes.ts'

declare global {
  interface Window {
    __veggies?: {
      stage: CreatureStage
      game: () => Game
      show: Show
      /** Starts a game with this seed. */
      start: (seed?: number) => void
      /** A tap (or a swipe from a to b) in the play plane. */
      slash: (ax: number, ay: number, bx?: number, by?: number) => GameEvent[]
    }
  }
}

const params = () => new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
const media = (q: string) => typeof window !== 'undefined' && window.matchMedia(q).matches
/** The play plane's shorter side, in its own units. */
const SHORT_SIDE = 6
/** A fingertip's reach beyond a veggie's own size, in CSS pixels, and the least it is in the play plane. */
const FINGER = 26, FINGER_LEAST = 0.22

type Phase = 'ready' | 'playing' | 'paused' | 'over'
type Popup = { id: number; x: number; y: number; text: string; tone: 'points' | 'bad' | 'combo' | 'gold' | 'hint' }

/** The play plane seen whole: its half width and height for a view `w` by `h`, and how far the camera stands. */
function planeFor(w: number, h: number) {
  const aspect = w > 0 && h > 0 ? w / h : 4 / 3
  const halfH = aspect >= 1 ? SHORT_SIDE / 2 : SHORT_SIDE / 2 / aspect
  return { halfW: halfH * aspect, halfH, distance: halfH / Math.tan(((STAGE_FOV / 2) * Math.PI) / 180) }
}

function readBest() {
  try { return Math.max(0, Number(localStorage.getItem(BEST_KEY)) || 0) } catch { return 0 }
}
function keepBest(score: number) {
  try { localStorage.setItem(BEST_KEY, String(score)) } catch { /* no storage: the best lasts the visit */ }
}

/** A kind's color for the lists: the main color its model bursts into. */
const swatch = (id: KindId, variant = 0) => (id === 'pepper' ? PEPPERS[variant] : modelOf(id, variant).debris[0][0])

/**
 * Veggie Slayer: vegetables thrown up from below, faster and faster; tap or swipe to burst them into a shower of
 * cubes. A veggie that falls back down costs a heart, and so does hitting a treat. Five hearts. Drawn in the shared
 * Blocks style (veggies/models.ts are block models, a blob a cube).
 */
export function VeggieSlayer() {
  const h1 = useFocusHeading()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState<CreatureStage>()
  const [drawn, setDrawn] = useState(false)
  const [failed, setFailed] = useState<string>()
  const offscreen = useMemo(() => params().get('offscreen') === '1', [])
  const calm = useMemo(() => media('(prefers-reduced-motion: reduce)'), [])
  const [lessMotion, setLessMotion] = useState(calm)
  const [sound, setSound] = useState(() => params().get('sound') !== '0')
  const [treats, setTreats] = useState(() => params().get('treats') !== '0')
  /** A friend's score to beat, from a shared link. */
  const beat = useMemo(() => { const n = Number(params().get('beat')); return Number.isInteger(n) && n > 0 && n < 100000 ? n : 0 }, [])
  const [phase, setPhase] = useState<Phase>('ready')
  const [hud, setHud] = useState({ score: 0, hearts: HEARTS })
  const [best, setBest] = useState(0)
  const [newBest, setNewBest] = useState(false)
  const [result, setResult] = useState<{ score: number; tally: Tally; combo: number; seconds: number }>()
  const [popups, setPopups] = useState<Popup[]>([])
  const [said, setSaid] = useState('')
  const [share, setShare] = useState<string>()
  const [ready, setReady] = useState(false)
  const again = useRef<HTMLButtonElement>(null)

  const game = useRef(new Game(1))
  const show = useRef<Show>(null)
  const sounds = useRef(new Sounds())
  const phaseNow = useRef(phase)
  phaseNow.current = phase
  const motionNow = useRef(lessMotion)
  motionNow.current = lessMotion
  const treatsNow = useRef(treats)
  treatsNow.current = treats
  const plane = useRef(planeFor(4, 3))
  const popupId = useRef(0)
  useEffect(() => { sounds.current.on = sound }, [sound])
  useEffect(() => { setBest(readBest()) }, [])

  useEffect(() => {
    let live: CreatureStage | undefined, gone = false
    import('./creature/stage.ts')
      .then(({ CreatureStage }) => CreatureStage.start(canvas.current!, { offscreen, webgl: params().get('webgl') === '1' }))
      .then((s) => {
        if (gone) { s.dispose(); return }
        live = s
        s.onFirstFrame = () => setDrawn(true)
        s.setFloor(0)
        setStage(s)
      }, (e: unknown) => { console.warn(e); setFailed('This browser could not start WebGPU or WebGL 2, which the game needs.') })
    return () => { gone = true; live?.dispose(); sounds.current.close() }
  }, [offscreen])

  /** What the game said happened: sounds, words over the view, the hearts and the score. */
  const hear = useRef<(events: GameEvent[]) => void>(() => {})
  hear.current = (events) => {
    if (!events.length || !stage) return
    const g = game.current
    show.current?.hear(events, stage.time, g)
    const add: Popup[] = []
    const at = (x: number, y: number, text: string, tone: Popup['tone']) => {
      const p = stage.screenAt([x, y, 0])
      // kept far enough from the edges to be read whole
      const w = canvas.current?.clientWidth ?? 0, room = Math.min(w / 2, text.length * 5 + 12)
      if (p) add.push({ id: ++popupId.current, x: Math.max(room, Math.min(w - room, p.x)), y: p.y, text, tone })
    }
    let hearts = false
    for (const e of events) {
      if (e.type === 'burst') {
        const k = kindOf(e.flyer.kind)
        sounds.current.play(k.group === 'golden' ? 'gold' : 'pop', 1.4 - k.radius * 0.8)
        at(e.flyer.x, e.flyer.y - k.radius * 0.4, `+${e.points}`, k.group === 'golden' ? 'gold' : 'points')
      } else if (e.type === 'chip') {
        sounds.current.play('crack')
        at(e.flyer.x, e.flyer.y - 0.5, e.flyer.hitsLeft > 1 ? 'Crack! Again!' : 'One more!', 'hint')
      } else if (e.type === 'treat') {
        sounds.current.play('treat')
        at(e.flyer.x, e.flyer.y - 0.4, 'Not a treat! −1 heart', 'bad')
        hearts = true
      } else if (e.type === 'miss') {
        sounds.current.play('miss')
        at(e.flyer.x, -g.halfH + 0.5, 'Got away! −1 heart', 'bad')
        hearts = true
      } else if (e.type === 'combo') {
        sounds.current.play('combo', 1 + e.count * 0.05)
        at(e.x, e.y + 0.6, `Combo ×${e.count}! +${e.bonus}`, 'combo')
      } else if (e.type === 'over') {
        sounds.current.play('over')
        const score = g.score, was = readBest()
        if (score > was) keepBest(score)
        setBest(Math.max(score, was))
        setNewBest(score > was && score > 0)
        setResult({ score, tally: { ...g.tally }, combo: g.bestCombo, seconds: g.t })
        setPhase('over')
        const { veggies } = g.counts()
        setSaid(`Game over. You burst ${veggies} ${veggies === 1 ? 'veggie' : 'veggies'} for ${score} points.`)
      }
    }
    setHud({ score: g.score, hearts: g.hearts })
    if (hearts && g.state === 'playing') setSaid(`${g.hearts} ${g.hearts === 1 ? 'heart' : 'hearts'} left. Score ${g.score}.`)
    if (add.length) {
      setPopups((p) => [...p.slice(-10), ...add])
      const ids = new Set(add.map((a) => a.id))
      setTimeout(() => setPopups((p) => p.filter((x) => !ids.has(x.id))), 1000)
    }
  }

  // the models, built once, and the poser that runs the game on the stage's clock
  useEffect(() => {
    if (!stage) return
    const t = setTimeout(() => {
      const veggies = buildVeggies(), debris = buildDebris(), words = buildWords()
      const s = new Show(veggies, debris, words)
      show.current = s
      stage.setActor(veggies, undefined, [debris, words])
      // the shared Blocks style as it starts everywhere, on the grid the models were cut on
      stage.setBlocks(blockLook(BLOCK_START, CELL, 0))
      let last = stage.time
      stage.setPoser((sk, now) => {
        const dt = Math.max(0, Math.min(0.1, now - last))
        last = now
        const g = game.current, p = plane.current
        g.setView(p.halfW, p.halfH)
        if (phaseNow.current === 'playing') {
          g.treats = treatsNow.current
          const events = g.step(dt)
          if (events.length) hear.current(events)
        }
        else if (phaseNow.current === 'over') g.drift(dt)
        if (phaseNow.current === 'ready') s.poseLineup(sk, now, p.halfW, p.halfH)
        else s.poseVeggies(sk, g)
        s.poseBursts(debris.skeleton, words.skeleton, now, p.halfH)
        const [x, y] = motionNow.current ? [0, 0] : s.shakeAt(now)
        stage.orbit = { target: [x, y, 0], distance: p.distance, azimuth: 0, elevation: 0 }
      })
      setReady(true)
    }, 30)
    return () => clearTimeout(t)
  }, [stage])

  // the view's size sets how much of the play plane shows
  useEffect(() => {
    const c = canvas.current
    if (!c || typeof ResizeObserver === 'undefined') return
    const fit = () => { plane.current = planeFor(c.clientWidth, c.clientHeight); stage?.invalidate() }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(c)
    return () => ro.disconnect()
  }, [stage])

  useEffect(() => { if (stage) stage.playing = phase !== 'paused' }, [stage, phase])
  // at the end, Play again is where focus goes, so a keyboard can start the next game at once
  useEffect(() => { if (phase === 'over' && document.activeElement === canvas.current) again.current?.focus({ preventScroll: true }) }, [phase])
  // a game left in the background waits
  useEffect(() => {
    const away = () => { if (document.hidden && phaseNow.current === 'playing') setPhase('paused') }
    document.addEventListener('visibilitychange', away)
    return () => document.removeEventListener('visibilitychange', away)
  }, [])

  const start = (seed = Math.floor(Math.random() * 1e9)) => {
    sounds.current.wake()
    game.current = new Game(seed)
    const p = plane.current
    game.current.setView(p.halfW, p.halfH)
    show.current?.clear()
    setHud({ score: 0, hearts: HEARTS })
    setResult(undefined)
    setNewBest(false)
    setPopups([])
    setPhase('playing')
    setSaid(`Go! ${HEARTS} hearts.`)
    if (stage) stage.playing = true
    // focus on the view, so Space can slice and Escape can pause straight away
    canvas.current?.focus({ preventScroll: true })
  }

  /** Turns a point on the view (CSS pixels from its top left) into the play plane. */
  const planeAt = (x: number, y: number) => {
    const c = canvas.current!, p = plane.current
    return [(x / c.clientWidth) * 2 * p.halfW - p.halfW, p.halfH - (y / c.clientHeight) * 2 * p.halfH] as const
  }
  const reach = () => Math.max(FINGER_LEAST, (FINGER * 2 * plane.current.halfH) / Math.max(1, canvas.current?.clientHeight ?? 1))
  const strokes = useRef(new Map<number, { stroke: number; x: number; y: number }>())
  const strokeId = useRef(0)
  const down = (ev: ReactPointerEvent<HTMLElement>) => {
    if (phase !== 'playing') return
    ev.preventDefault()
    ev.currentTarget.setPointerCapture(ev.pointerId)
    const r = ev.currentTarget.getBoundingClientRect(), [x, y] = planeAt(ev.clientX - r.left, ev.clientY - r.top)
    const stroke = ++strokeId.current
    strokes.current.set(ev.pointerId, { stroke, x, y })
    hear.current(game.current.slash(stroke, x, y, x, y, reach()))
  }
  const move = (ev: ReactPointerEvent<HTMLElement>) => {
    const s = strokes.current.get(ev.pointerId)
    if (!s || phase !== 'playing') return
    const r = ev.currentTarget.getBoundingClientRect(), [x, y] = planeAt(ev.clientX - r.left, ev.clientY - r.top)
    hear.current(game.current.slash(s.stroke, s.x, s.y, x, y, reach()))
    s.x = x
    s.y = y
  }
  const up = (ev: ReactPointerEvent<HTMLElement>) => {
    const s = strokes.current.get(ev.pointerId)
    strokes.current.delete(ev.pointerId)
    if (s) hear.current(game.current.endStroke(s.stroke))
  }
  /** Keyboard play: Space or Enter slices the veggie that would fall out soonest. */
  const sliceNearest = () => {
    const f = game.current.nearestToFalling()
    if (!f) return
    const stroke = ++strokeId.current
    hear.current([...game.current.slash(stroke, f.x, f.y, f.x, f.y, 0.01), ...game.current.endStroke(stroke)])
  }

  // for verify: the stage, the game and a way to tap without a pointer
  useEffect(() => {
    if (!stage || !ready || !show.current) return
    window.__veggies = {
      stage, game: () => game.current, show: show.current, start: (seed = 1) => start(seed),
      slash: (ax, ay, bx = ax, by = ay) => { const stroke = ++strokeId.current; const e = [...game.current.slash(stroke, ax, ay, bx, by, FINGER_LEAST), ...game.current.endStroke(stroke)]; hear.current(e); return e },
    }
    return () => { delete window.__veggies }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, ready])

  const shareLink = () => {
    const url = new URL(location.href)
    url.search = ''
    if (result?.score) url.searchParams.set('beat', String(result.score))
    return url.toString()
  }
  const counted = result ? KINDS.filter((k) => (result.tally[k.id] ?? 0) > 0) : []
  const veggiesBurst = counted.filter((k) => k.group !== 'treat').reduce((s, k) => s + (result?.tally[k.id] ?? 0), 0)
  const waiting = !failed && (!drawn || !ready)
  const backend = stage ? (stage.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2') : 'WebGPU or WebGL 2'

  const tallyList = (r: NonNullable<typeof result>) => (
    <ul className="grid gap-1 text-sm" data-testid="veggie-tally">
      {KINDS.filter((k) => (r.tally[k.id] ?? 0) > 0).map((k) => (
        <li key={k.id} className="flex items-center gap-2">
          <span aria-hidden className="size-3 flex-none rounded-[2px]" style={{ background: swatch(k.id) }} />
          <span className="flex-1">{(r.tally[k.id] ?? 0) === 1 ? k.name : k.plural}{k.group === 'treat' ? ' (oops)' : ''}</span>
          <span className="tabular-nums">{r.tally[k.id]}</span>
          <span className="w-14 text-right tabular-nums text-ink-faint">{k.group === 'treat' ? '−♥' : `${(r.tally[k.id] ?? 0) * k.points} pts`}</span>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="pb-4">
      <Crumbs here="Veggie Slayer" parent={{ label: 'Experiments', href: href({ page: 'experiments' }) }} />
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-4 pb-6">
        <h1 ref={h1} tabIndex={-1} className="font-display text-4xl outline-none sm:text-5xl">Veggie Slayer</h1>
        <p className="max-w-xl text-lg text-ink-muted">
          Vegetables are flying up at you, and they look grumpy about it. Tap them, or swipe through several at once, to
          burst them into a shower of blocks. Let one fall back down and you lose a heart. Leave the treats alone!
        </p>
      </header>
      <Workbench
        viewLabel="The game"
        fullScreenAt="bottom-3 right-3 max-sm:bottom-2 max-sm:right-2"
        view={<>
          <div aria-hidden className="absolute inset-0" style={{ background: 'radial-gradient(circle at 18% 12%, #fff7b0 0 6%, transparent 7%), radial-gradient(circle at 1px 1px, rgba(255,255,255,0.35) 2px, transparent 2.5px) 0 0 / 28px 28px, linear-gradient(180deg, #5cc8ff 0%, #9be7ff 45%, #b9f5c4 100%)' }} />
          <canvas
            ref={canvas}
            role="application"
            aria-roledescription="game"
            aria-label={phase === 'playing' ? 'Veggie Slayer. Tap or swipe the vegetables to burst them. Space or Enter bursts the one about to fall; Escape pauses.' : 'Veggie Slayer.'}
            tabIndex={0}
            data-testid="veggie-view"
            className="absolute inset-0 h-full w-full touch-none outline-none select-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
            style={{ cursor: phase === 'playing' ? 'crosshair' : 'default' }}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onKeyDown={(ev) => {
              if (phase === 'playing' && (ev.key === ' ' || ev.key === 'Enter')) { ev.preventDefault(); sliceNearest() }
              else if (phase === 'playing' && (ev.key === 'Escape' || ev.key === 'p')) { ev.preventDefault(); setPhase('paused') }
              else if (phase === 'paused' && (ev.key === 'Escape' || ev.key === 'p' || ev.key === ' ')) { ev.preventDefault(); setPhase('playing') }
            }}
          />
          {/* words over the view: points, combos, hearts lost */}
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            {popups.map((p) => (
              <span
                key={p.id}
                className={`absolute -translate-x-1/2 -translate-y-1/2 font-display whitespace-nowrap ${lessMotion ? '' : 'motion-safe:animate-[bs-veggie-pop_1s_ease-out_forwards]'} ${p.tone === 'bad' ? 'text-lg text-[#ff3b5c]' : p.tone === 'combo' ? 'text-2xl text-[#ffe94d]' : p.tone === 'gold' ? 'text-3xl text-[#ffd84a]' : p.tone === 'hint' ? 'text-base text-white' : 'text-2xl text-white'}`}
                style={{ left: p.x, top: p.y, textShadow: '0 2px 0 #3a1c5a, 2px 0 0 #3a1c5a, -2px 0 0 #3a1c5a, 0 -2px 0 #3a1c5a' }}
              >{p.text}</span>
            ))}
          </div>
          {/* hearts and score */}
          {(phase === 'playing' || phase === 'paused') && (
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 sm:p-3">
              <div className="flex gap-0.5 rounded-full bg-[#3a1c5a]/70 px-2 py-1" role="img" aria-label={`${hud.hearts} of ${HEARTS} hearts left`} data-testid="veggie-hearts">
                {Array.from({ length: HEARTS }, (_, i) => (
                  <svg key={i} viewBox="0 0 16 16" aria-hidden className="size-5 sm:size-6"><path d="M8 14.5 2 8.6C.3 6.9.4 4.2 2.2 2.8 3.8 1.6 6.1 1.9 7.3 3.4L8 4.2l.7-.8c1.2-1.5 3.5-1.8 5.1-.6 1.8 1.4 1.9 4.1.2 5.8z" fill={i < hud.hearts ? '#ff4d6d' : 'rgba(255,255,255,0.25)'} stroke="#fff" strokeWidth={i < hud.hearts ? 1 : 0.6} /></svg>
                ))}
              </div>
              <div className="pointer-events-auto flex items-center gap-1.5">
                <span className="rounded-full bg-[#3a1c5a]/70 px-3 py-1 font-display text-lg text-white tabular-nums sm:text-xl" data-testid="veggie-score">{hud.score} <span className="text-sm opacity-80">pts</span></span>
                <button type="button" onClick={() => setPhase(phase === 'paused' ? 'playing' : 'paused')} className="zoom-btn" aria-label={phase === 'paused' ? 'Resume' : 'Pause'} title={phase === 'paused' ? 'Resume' : 'Pause'} data-testid="veggie-pause">
                  <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5" fill="currentColor">{phase === 'paused' ? <path d="M4 2.5v11l9-5.5z" /> : <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" />}</svg>
                </button>
              </div>
            </div>
          )}
          {ready && phase === 'ready' && (
            <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 px-4 pb-12 text-center sm:pb-14">
              <p className="font-display text-3xl text-white sm:text-5xl" style={{ textShadow: '0 3px 0 #3a1c5a, 3px 0 0 #3a1c5a, -3px 0 0 #3a1c5a, 0 -3px 0 #3a1c5a' }}>Veggie Slayer</p>
              <p className="rounded-full bg-[#3a1c5a]/75 px-3 py-1 text-sm text-white">Burst the veggies. Leave the treats alone!</p>
              {beat > 0 && <p className="rounded-full bg-[#3a1c5a]/75 px-3 py-1 text-sm text-white">A friend scored {beat} points. Can you beat it?</p>}
              <Button primary onClick={() => start()} data-testid="veggie-play">Play</Button>
            </div>
          )}
          {phase === 'paused' && (
            <div className="absolute inset-0 grid place-items-center bg-[#3a1c5a]/40">
              <div className="flex flex-col items-center gap-3 rounded-2xl bg-paper/95 p-5 text-center shadow-xl">
                <p className="font-display text-2xl">Paused</p>
                <div className="flex gap-2"><Button primary onClick={() => setPhase('playing')} data-testid="veggie-resume">Resume</Button><Button onClick={() => start()}>Start over</Button></div>
              </div>
            </div>
          )}
          {phase === 'over' && result && (
            <div className="absolute inset-0 overflow-auto bg-[#3a1c5a]/45 p-3 sm:p-6" data-testid="veggie-over">
              <div className="mx-auto flex max-w-sm flex-col gap-3 rounded-2xl bg-paper/95 p-4 shadow-xl sm:p-5">
                <div className="text-center">
                  <p className="font-display text-3xl">Game over</p>
                  <p className="mt-1 text-lg"><span className="font-display text-2xl tabular-nums">{result.score}</span> points{newBest ? ', a new best!' : ''}</p>
                  <p className="text-sm text-ink-muted">{veggiesBurst} {veggiesBurst === 1 ? 'veggie' : 'veggies'} burst{result.combo >= 2 ? `, best combo ×${result.combo}` : ''}{!newBest && best > 0 ? `. Your best is ${best}.` : '.'}</p>
                </div>
                {counted.length ? tallyList(result) : <p className="text-center text-sm text-ink-muted">Not a single veggie burst. They're still out there, looking grumpy.</p>}
                <div className="flex flex-wrap justify-center gap-2">
                  <Button ref={again} primary onClick={() => start()} data-testid="veggie-again">Play again</Button>
                  <Button onClick={() => setShare(shareLink())} data-testid="veggie-share">Share</Button>
                </div>
              </div>
            </div>
          )}
          {waiting && <LoadingMark testid="veggie-loading" />}
          <p role="status" className="sr-only">{waiting ? (stage ? 'Making the veggies…' : 'Starting the splat engine…') : said}</p>
          {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{failed}</div>}
        </>}
        status={<>
          <span>{best > 0 ? <>Your best: <span className="tabular-nums text-ink" data-testid="veggie-best">{best}</span> points</> : 'No best score yet.'}</span>
          <span>Blocks on {backend}</span>
        </>}
        tabsLabel="Options"
        tabs={[
          {
            id: 'game', label: 'Game', content: (
              <div className={TAB_SECTIONS}>
                <div className="flex flex-wrap gap-1.5">
                  {phase === 'playing' || phase === 'paused'
                    ? <><Button small onClick={() => setPhase(phase === 'paused' ? 'playing' : 'paused')}>{phase === 'paused' ? 'Resume' : 'Pause'}</Button><Button small onClick={() => start()}>Start over</Button></>
                    : <Button small primary onClick={() => start()} disabled={!ready}>{phase === 'over' ? 'Play again' : 'Play'}</Button>}
                </div>
                <div>
                  <p className="text-sm font-medium">How to play</p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-ink-muted">
                    <li>Tap a vegetable, or swipe through it, to burst it.</li>
                    <li>One swipe through two or more is a combo, worth a bonus.</li>
                    <li>A pumpkin takes three hits: each one cracks a side off.</li>
                    <li>Let a vegetable fall back down and you lose a heart. Five hearts and it's over.</li>
                    <li>Don't hit the cookies, ice cream, cupcakes or donuts: each one costs a heart.</li>
                    <li>They come faster and faster. With a keyboard, Space bursts the one about to fall and Escape pauses.</li>
                  </ul>
                </div>
                <div>
                  <p className="text-sm font-medium">Points</p>
                  <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-sm" data-testid="veggie-points">
                    {KINDS.filter((k) => k.group !== 'treat').map((k) => (
                      <li key={k.id} className="flex items-center gap-1.5">
                        <span aria-hidden className="size-3 flex-none rounded-[2px]" style={{ background: swatch(k.id) }} />
                        <span className="flex-1 truncate">{k.id === 'sprout' ? 'Golden sprout' : k.id === 'lettuce' ? 'Lettuce' : k.name}</span>
                        <span className="tabular-nums text-ink-muted">{k.points}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-xs text-ink-faint">The rarer the veggie, the more it's worth. The golden Brussels sprout hardly ever shows up.</p>
                </div>
                {result && counted.length > 0 && (
                  <div>
                    <p className="text-sm font-medium">Your last game: {result.score} points</p>
                    <div className="mt-1.5">{tallyList(result)}</div>
                  </div>
                )}
              </div>
            ),
          },
          {
            id: 'settings', label: 'Settings', content: (
              <div className={TAB_SECTIONS}>
                <div>
                  <Toggle label="Sound" checked={sound} onChange={setSound} />
                  <p className="mt-1.5 text-xs text-ink-faint">Pops, cracks and chimes, made in the browser as they play.</p>
                </div>
                <div>
                  <Toggle label="Less motion" checked={lessMotion} onChange={setLessMotion} />
                  <p className="mt-1.5 text-xs text-ink-faint">No shaking when something bursts, and the points stay put instead of floating up. On at first when your device asks for less motion.</p>
                </div>
                <div>
                  <Toggle label="Treats" checked={treats} onChange={setTreats} />
                  <p className="mt-1.5 text-xs text-ink-faint">Cookies, ice cream, cupcakes and donuts thrown in among the veggies, costing a heart when hit. Off makes it veggies only.</p>
                </div>
              </div>
            ),
          },
        ]}
      />
      <ShareDialog
        link={share}
        title={result ? `I burst ${veggiesBurst} veggies for ${result.score} points in Veggie Slayer!` : 'Veggie Slayer'}
        heading="Share your score"
        about="The link opens Veggie Slayer with your score as the one to beat."
        onClose={() => setShare(undefined)}
      />

      <section aria-labelledby="how-title" className="mt-14 border-t border-rule pt-10 lg:grid lg:grid-cols-12 lg:gap-x-5 lg:pt-14">
        <div className="lg:col-span-5">
          <p className="text-sm text-ink-faint">How it works</p>
          <h2 id="how-title" className="mt-1 max-w-[16ch] font-display text-4xl leading-[1.05] text-balance sm:text-5xl">Veggies made of cubes</h2>
        </div>
        <div className="mt-8 max-w-[36em] space-y-4 text-lg leading-relaxed text-ink-muted lg:col-span-7 lg:mt-0 lg:text-xl">
          <p>
            Every vegetable is sculpted cell by cell on a grid, one blob a cell, and drawn in Blobscape's Blocks style, so
            each blob becomes one cube with its own color, its faces lit and shaded and its corners darkened where cubes
            meet. The grumpy faces are painted onto the front cells.
          </p>
          <p>
            Each veggie, each cube of a burst and each word that pops up is a bone of its own. Nothing is built while you
            play: a burst borrows cubes from a fixed pool of each color and throws them, and the oldest are taken back
            when a pool runs out, so a busy moment on a phone costs no more than a quiet one.
          </p>
          <p>
            A pumpkin is three pieces on three bones, which is why a hit can knock a whole side off it and leave the hollow
            inside showing.
          </p>
        </div>
      </section>
    </div>
  )
}
