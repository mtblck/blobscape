import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { LoadingMark } from '../shared/BlobLoader.tsx'
import { Button, Chip, Field } from '../shared/ui.tsx'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { TAB_SECTIONS, Workbench } from '../shared/Workbench.tsx'
import { href } from './routes.ts'
import type { CameraView, DungeonStage } from './dungeon/stage.ts'
import { GOLD_HEAL, MAX_HP, MAX_MP, SPELL_COST, type Difficulty, type GameEvent } from './dungeon/game.ts'

const LOOKS = [{ id: 'forest', label: 'Forest' }, { id: 'dusk', label: 'Dusk' }, { id: 'autumn', label: 'Autumn' }]
const VIEWS: { id: CameraView; label: string }[] = [{ id: 'close', label: 'Close' }, { id: 'far', label: 'Far' }, { id: 'high', label: 'High' }]
const DETAIL = [{ id: 0.35, label: 'Light' }, { id: 1, label: 'Full' }, { id: 1.8, label: 'Fine' }]
const LIGHTS = [{ id: 'live', label: 'Live' }, { id: 'baked', label: 'Baked' }] as const
const DIFFICULTY: { id: Difficulty; label: string }[] = [{ id: 'gentle', label: 'Gentle' }, { id: 'normal', label: 'Normal' }, { id: 'hard', label: 'Hard' }]

declare global {
  interface Window { __dungeon?: { stage: DungeonStage } }
}

interface Hud {
  hp: number
  mp: number
  wave: number
  score: number
  alive: number
  banner: string | null
  down: boolean
  blobs: number
  fps: number
}
const START: Hud = { hp: MAX_HP, mp: MAX_MP, wave: 1, score: 0, alive: 0, banner: null, down: false, blobs: 0, fps: 0 }

/**
 * Dungeon Run: the elf, now with a sword and a hand full of fire and frost, in a
 * torchlit hall that slimes of five colors hop into, wave after wave.
 * Health and magic show as bars over the view. One scene on Blobscape's own
 * splat engine; the slimes burst into splats.
 */
export function DungeonRun() {
  const h1 = useFocusHeading()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState<DungeonStage>()
  const [drawn, setDrawn] = useState(false)
  const [failed, setFailed] = useState<string>()
  const [busy, setBusy] = useState<string>()
  const offscreen = useMemo(() => new URLSearchParams(location.search).get('offscreen') === '1', [])
  const webgl = useMemo(() => new URLSearchParams(location.search).get('webgl') === '1', [])
  const [look, setLook] = useState('forest')
  const [detail, setDetail] = useState<number>()
  const [view, setView] = useState<CameraView>('close')
  const [light, setLight] = useState<'live' | 'baked'>()
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [paused, setPaused] = useState(false)
  const [hud, setHud] = useState<Hud>(START)
  const [hurts, setHurts] = useState(0)
  const [said, setSaid] = useState('')
  const [best, setBest] = useState(0)
  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

  useEffect(() => {
    let live: DungeonStage | undefined, gone = false
    import('./dungeon/stage.ts')
      .then(({ DungeonStage }) => DungeonStage.start(canvas.current!, { offscreen, webgl }))
      .then((s) => {
        if (gone) { s.dispose(); return }
        live = s
        s.onFirstFrame = () => setDrawn(true)
        s.onTick = (d, fps) => {
          const g = d.game
          setHud({
            hp: g.hero.hp, mp: g.hero.mp, wave: g.wave, score: g.score, alive: g.alive,
            banner: g.banner?.text ?? null, down: g.state === 'down', blobs: d.blobCount, fps,
          })
        }
        s.onEvents = (events) => {
          for (const e of events) {
            if (e.type === 'hurt') {
              setHurts((n) => n + 1)
              const hp = s.dungeon?.game.hero.hp ?? 0
              if (hp > 0 && hp < 30 && hp + e.damage >= 30) announce('Health low.')
            }
            if (e.type === 'scorch') setHurts((n) => n + 1)
            const line = say(e)
            if (line) announce(line)
            if (e.type === 'cleared' || e.type === 'down') setBest((b) => Math.max(b, e.type === 'cleared' ? e.wave : e.wave - 1))
          }
        }
        setStage(s)
        setDetail((d) => d ?? (s.backend === 'webgpu' ? 1 : 0.35))
        // live lights cost a pass on WebGPU, but every corner of every blob on WebGL: there they start baked
        setLight((l) => l ?? (s.backend === 'webgpu' ? 'live' : 'baked'))
      }, (e: unknown) => { console.warn(e); setFailed('This browser could not start WebGPU or WebGL 2, which the dungeon needs.') })
    return () => { gone = true; live?.dispose() }
  }, [offscreen, webgl])

  // Building the hall takes a moment: let the note paint first
  useEffect(() => {
    if (!stage || detail === undefined || !light) return
    setBusy('Lighting the torches…')
    const t = setTimeout(() => {
      stage.setDungeon({ detail, look, difficulty, light })
      stage.dungeon!.flicker = !calm
      setHud((h) => ({ ...h, blobs: stage.blobCount }))
      setBusy(undefined)
    }, 30)
    return () => clearTimeout(t)
  }, [stage, detail, look, light]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (stage?.dungeon) stage.dungeon.game.difficulty = difficulty }, [stage, difficulty, busy])
  useEffect(() => { if (stage) stage.view = view }, [stage, view])
  useEffect(() => { if (stage) stage.paused = paused }, [stage, paused])

  // --- input: keys, the thumb stick and the two buttons all feed one input
  const keys = useRef(new Set<string>())
  const stick = useRef({ forward: 0, turn: 0 })
  const held = useRef({ swing: false, cast: false, frost: false })
  const stageRef = useRef(stage)
  stageRef.current = stage
  const push = () => {
    const stage = stageRef.current
    if (!stage) return
    const k = keys.current
    const forward = (k.has('f') ? 1 : 0) - (k.has('b') ? 1 : 0) + stick.current.forward
    const turn = (k.has('r') ? 1 : 0) - (k.has('l') ? 1 : 0) + stick.current.turn
    stage.input = {
      forward: Math.max(-1, Math.min(1, forward)), turn: Math.max(-1, Math.min(1, turn)),
      swing: k.has('swing') || held.current.swing, cast: k.has('cast') || held.current.cast, frost: k.has('frost') || held.current.frost,
    }
  }
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const calm = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  // the game was set by keys, so give focus back to the view after an overlay
  const resume = () => { setPaused(false); canvas.current?.focus({ preventScroll: true }) }
  const restart = () => {
    stageRef.current?.dungeon?.game.restart()
    resume()
    announce('Wave 1. Here they come.')
  }
  // the same line twice is read twice: alternate an invisible mark on the end
  const said2 = useRef(0)
  const announce = (line: string) => { said2.current++; setSaid(line + (said2.current % 2 ? '\u200b' : '')) }
  useEffect(() => {
    const KEYS: Record<string, string> = {
      ArrowUp: 'f', KeyW: 'f', ArrowDown: 'b', KeyS: 'b', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r',
      Space: 'swing', KeyJ: 'swing', KeyK: 'cast', KeyE: 'cast', KeyL: 'frost', KeyQ: 'frost',
    }
    // keys play from anywhere on the page, except where they already mean something (typing, sliders, tabs, a focused button for Space)
    const mine = (e: KeyboardEvent) => {
      const t = e.target
      if (!(t instanceof HTMLElement)) return true
      // not in the site's own header, menu and footer, nor where a key already means something
      if (t.isContentEditable || t.closest('input, textarea, select, [role=tab], [role=slider], nav, [role=dialog], footer')) return false
      return !((e.code === 'Space' || e.code === 'Enter') && t.closest('button, a'))
    }
    const down = (e: KeyboardEvent) => {
      // a held Space or Enter mustn't press a button that takes focus mid-fight (Try again)
      if (e.repeat && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); return }
      if (e.metaKey || e.ctrlKey || e.altKey || !mine(e)) return
      const stage = stageRef.current
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (stage?.dungeon?.game.state === 'down') return
        e.preventDefault()
        if (pausedRef.current) resume()
        else setPaused(true)
        return
      }
      if (e.code === 'KeyR' && stage?.dungeon?.game.state === 'down') { restart(); return }
      const k = KEYS[e.code]
      if (!k) return
      e.preventDefault()
      if (pausedRef.current) return
      if (k === 'swing' || k === 'cast' || k === 'frost') stage?.tap(k)
      keys.current.add(k)
      push()
    }
    const up = (e: KeyboardEvent) => { const k = KEYS[e.code]; if (k && keys.current.delete(k)) push() }
    const clear = () => { keys.current.clear(); stick.current = { forward: 0, turn: 0 }; held.current = { swing: false, cast: false, frost: false }; push() }
    // leaving the tab or the window pauses, so the slimes don't win while you're away
    const playing = () => stageRef.current?.dungeon?.game.state === 'playing'
    const leave = () => { clear(); if (playing()) setPaused(true) }
    const away = () => { clear(); if (document.hidden && playing()) setPaused(true) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', leave)
    document.addEventListener('visibilitychange', away)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', leave)
      document.removeEventListener('visibilitychange', away)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { push() }, [stage]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!stage || !offscreen) return
    window.__dungeon = { stage }
    return () => { delete window.__dungeon }
  }, [stage, offscreen])

  const backend = stage ? (stage.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2') : 'WebGPU or WebGL 2'
  const loading = !failed && (!drawn || !!busy)
  const loadingLabel = busy ?? (stage ? 'Lighting the torches…' : 'Starting the splat engine…')
  const hold = (what: 'swing' | 'cast' | 'frost', on: boolean) => {
    held.current[what] = on
    if (on) stage?.tap(what)
    push()
  }

  return (
    <div className="pb-4">
      <Crumbs here="Dungeon Run" parent={{ label: 'Experiments', href: href({ page: 'experiments' }) }} />
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-4 pb-6">
        <h1 ref={h1} tabIndex={-1} className="font-display text-4xl outline-none sm:text-5xl">Dungeon Run</h1>
        <p className="max-w-xl text-lg text-ink-muted">
          The elf has a sword and a hand full of fire and frost, and the dungeon has slimes. Five colors of them hop in, wave
          after wave, and burst into splats when you win.
        </p>
      </header>
      <Workbench
        viewLabel="Dungeon"
        fullScreenAt="top-[4.75rem] left-3"
        view={<>
              <canvas
                ref={canvas}
                role="application"
                aria-roledescription="3D game"
                aria-label="The elf in a torchlit dungeon hall, seen from behind. Arrow keys or W, A, S and D run and turn; Space or J swings the sword; K or E throws fire, which spreads over the floor and burns; L or Q throws frost, which spreads and slows; P pauses."
                tabIndex={0}
                data-testid="dungeon-view"
                className="absolute inset-0 h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
              />
              {/* a red edge flashes when a slime gets you */}
              {hurts > 0 && <div key={hurts} aria-hidden className="dungeon-hurt pointer-events-none absolute inset-0" />}
              <Bars hp={hud.hp} mp={hud.mp} />
              <div className="pointer-events-none absolute top-3 right-3 text-right text-xs leading-tight text-ink sm:text-sm" data-testid="dungeon-score">
                <p className="font-display text-base sm:text-lg">Wave {hud.wave}</p>
                <p className="text-ink-muted"><span className="tabular-nums text-ink">{hud.score}</span> burst{best > 0 && <>, best wave <span className="tabular-nums text-ink">{best}</span></>}</p>
              </div>
              {hud.banner && !hud.down && !loading && (
                <p aria-hidden key={hud.banner} className="dungeon-banner pointer-events-none absolute inset-x-0 top-[30%] text-center font-display text-4xl text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)] sm:text-5xl">{hud.banner}</p>
              )}
              {loading && <LoadingMark testid="dungeon-loading" />}
              <p role="status" className="sr-only">{loading ? loadingLabel : said}</p>
              {failed && <div role="alert" className="absolute inset-4 grid place-items-center text-center text-sm text-ink">{failed}</div>}
              {!loading && !failed && (
                <>
                  <Stick onChange={(v) => { stick.current = v; push() }} />
                  <div className="absolute right-3 bottom-3 flex items-end gap-2.5">
                    <div className="grid gap-2">
                      <ActionButton label="Frost" sub={`${SPELL_COST} magic`} tone="frost" onHold={(on) => hold('frost', on)} disabled={hud.mp < SPELL_COST}>
                        {[0, 60, 120].map((a) => <path key={a} transform={`rotate(${a} 12 12)`} d="M11 2h2v2.6l1.8-1.8 1.4 1.4L13 7.4v9.2l3.2 3.2-1.4 1.4-1.8-1.8V22h-2v-2.6l-1.8 1.8-1.4-1.4L11 16.6V7.4L7.8 4.2l1.4-1.4L11 4.6z" />)}
                      </ActionButton>
                      <ActionButton label="Fire" sub={`${SPELL_COST} magic`} tone="fire" onHold={(on) => hold('cast', on)} disabled={hud.mp < SPELL_COST}>
                        <path d="M12 2c1 4 6 6.5 6 12a6 6 0 0 1-12 0c0-2.5 1.2-4.3 2.5-5.8.300 1.7 1 2.6 2 3C10.3 8 10.8 5 12 2z" />
                      </ActionButton>
                    </div>
                    <ActionButton label="Sword" tone="sword" big onHold={(on) => hold('swing', on)}>
                      <path d="M19 2h3v3L10.5 16.5l-3-3zM6.3 13.7l4 4-1.4 1.4-1.3-1.3-2.8 2.8-1.4-1.4 2.8-2.8-1.3-1.3z" />
                    </ActionButton>
                  </div>
                  {!coarse && (
                    <p aria-hidden className="pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 rounded-full bg-paper/80 px-2.5 py-0.5 text-xs text-ink backdrop-blur-sm md:block">
                      WASD to run · Space to swing · K for fire · L for frost · P to pause
                    </p>
                  )}
                </>
              )}
              {hud.down && !loading && (
                <Overlay title="You were slimed">
                  <p className="text-sm text-ink-muted">
                    You got to wave {hud.wave} and burst {hud.score} slime{hud.score === 1 ? '' : 's'}.
                  </p>
                  <Button primary onClick={restart} autoFocus>Try again</Button>
                  <p className="text-xs text-ink-faint">or press R</p>
                </Overlay>
              )}
              {paused && !hud.down && !loading && (
                <Overlay title="Paused">
                  <Button primary onClick={resume} autoFocus>Carry on</Button>
                  <p className="text-xs text-ink-faint">or press P or Escape</p>
                </Overlay>
              )}
        </>}
        status={<div data-testid="dungeon-stats">
              <span className="tabular-nums text-ink">{hud.blobs.toLocaleString()}</span> blobs,{' '}
              <span className="tabular-nums text-ink">{hud.alive}</span> slime{hud.alive === 1 ? '' : 's'} in the hall
              {hud.fps > 0 && <span className="text-ink-faint">, {Math.round(hud.fps)} fps</span>}.{' '}
              <span aria-live="polite">{busy ?? ''}</span>
        </div>}
        tabsLabel="Options"
        tabs={[
          {
            id: 'game', label: 'Game Settings', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Difficulty">
                  <div className="flex flex-wrap gap-1.5">
                    {DIFFICULTY.map((d) => <Chip key={d.id} active={difficulty === d.id} onClick={() => setDifficulty(d.id)}>{d.label}</Chip>)}
                  </div>
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button small onClick={() => (paused ? resume() : setPaused(true))} disabled={hud.down}>{paused ? 'Carry on' : 'Pause'}</Button>
                  <Button small onClick={restart}>Start again</Button>
                </div>
                <p className="text-xs text-ink-faint">
                  Fire spreads over the floor for a moment and burns whatever stands in it, you included, then leaves the stone
                  scorched. Frost spreads further, lies longer and slows whatever crosses it. Where the two meet they cancel.
                </p>
                <p className="text-xs text-ink-faint">Gold slimes are rare and quick. Bursting one gives back {GOLD_HEAL} health and some magic.</p>
              </div>
            ),
          },
          {
            id: 'hero', label: 'Character Style', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Look">
                  <div className="flex flex-wrap gap-1.5">
                    {LOOKS.map((l) => <Chip key={l.id} active={look === l.id} onClick={() => setLook(l.id)}>{l.label}</Chip>)}
                  </div>
                </Field>
                <p className="text-xs text-ink-faint">
                  The elf from <a href={href({ page: 'forest' })} className="underline hover:text-accent">Forest Walk</a>, with two more bones:
                  one for the sword, so the blade can lead a swing, and one for the orb of magic, which shrinks as the magic runs down.
                </p>
              </div>
            ),
          },
          {
            id: 'view', label: 'View', content: (
              <div className={TAB_SECTIONS}>
                <Field label="Camera">
                  <div className="flex flex-wrap gap-1.5">
                    {VIEWS.map((v) => <Chip key={v.id} active={view === v.id} onClick={() => setView(v.id)}>{v.label}</Chip>)}
                  </div>
                </Field>
                <Field label="Lighting">
                  <div className="flex flex-wrap gap-1.5">
                    {LIGHTS.map((l) => <Chip key={l.id} active={light === l.id} onClick={() => setLight(l.id)}>{l.label}</Chip>)}
                  </div>
                </Field>
                <Field label="Detail">
                  <div className="flex flex-wrap gap-1.5">
                    {DETAIL.map((d) => <Chip key={d.id} active={detail === d.id} onClick={() => setDetail(d.id)}>{d.label}</Chip>)}
                  </div>
                </Field>
                <p className="text-xs text-ink-faint">Lighter detail runs smoother on older phones.</p>
              </div>
            ),
          },
        ]}
      />

      <section aria-labelledby="how-title" className="mt-14 border-t border-rule pt-10 lg:grid lg:grid-cols-12 lg:gap-x-5 lg:pt-14">
        <div className="lg:col-span-5">
          <p className="text-sm text-ink-faint">How it works</p>
          <h2 id="how-title" className="mt-1 max-w-[16ch] font-display text-4xl leading-[1.05] text-balance sm:text-5xl">Circles underneath, blobs on top</h2>
        </div>
        <div className="mt-8 max-w-[36em] space-y-4 text-lg leading-relaxed text-ink-muted lg:col-span-7 lg:mt-0 lg:text-xl">
          <p>
            Under the blobs the game is flat and simple. The hero, each slime and each pillar is a circle on the floor. A sword
            swing hits any slime whose circle comes within reach in a wedge in front of the hero, and a bolt of fire or frost hits
            the first circle it flies into. Slimes push each other apart, so they crowd round you instead of piling up. None of this
            looks at a single blob, which is why it stays quick with a hundred thousand of them on screen.
          </p>
          <p>
            Every slime is a small rig. A top and four sides about a core are pulled in and out for the squash before a hop and the
            stretch in the air. Sixteen more bones each carry one drop of jelly, kept at no size while the slime lives. When it
            bursts, the body shrinks to nothing and the drops fly out, fall and lie on the floor as splats. Nothing is rebuilt.
            Blobscape's own splat engine, running here on {backend}, moves every blob by its bones each frame and sorts the whole
            hall together.
          </p>
          <p>
            The floor is a grid of half-meter cells, each of which can burn or freeze. Where a bolt lands a patch catches, and
            ten times a second each lit cell may pass it on to a neighbor, a few cells out and no further. Fire burns for a
            couple of seconds and leaves the stone scorched, so it can't catch again for a while; frost lies for longer and then
            melts; where they meet, one puts the other out. The game only asks what a circle is standing on. To show it, the
            flagstones' own blobs are recolored whenever the grid changes, and a dozen flames and a few clumps of ice, built
            once and kept at no size, are stood on the hottest and coldest cells.
          </p>
          <p>
            Light comes two ways. Baked, the torchlight is worked into the stone's color when the hall is built, so it costs
            nothing to draw. Live, every blob is lit afresh each frame by up to sixteen lights: the eight torches, flickering with
            their flames, the orb in the hero's hand (dimmer as the magic runs down), each bolt as it flies, the flames on the
            floor, and a flash of color as a slime bursts. A blob is a flat disc, so it knows which way it lies: its thinnest axis. Light is strongest where a
            disc turns square to it and falls away with distance. A disc doesn't know which face is its outside, so both faces
            catch the light, which is right for floors and walls and a little soft on round things. Bones are the subject of the <a href={href({ page: 'lesson', id: 'one-bone' })} className="underline decoration-rule underline-offset-2 hover:text-accent">rigs lessons</a>,
            and the slimes' colors come from blobs adding up, which is <a href={href({ page: 'lesson', id: 'order' })} className="underline decoration-rule underline-offset-2 hover:text-accent">Order matters</a>.
          </p>
        </div>
      </section>
    </div>
  )
}

/** A line for screen readers about what just happened, or nothing for the small stuff. */
function say(e: GameEvent): string | null {
  switch (e.type) {
    case 'wave': return `Wave ${e.wave}. Here they come.`
    case 'cleared': return `Wave ${e.wave} cleared. Some health back.`
    case 'down': return `You were slimed on wave ${e.wave}. Press R to try again.`
    case 'burst': return e.kind === 'gold' ? 'A gold slime burst: health and magic back.' : null
    case 'fizzle': return 'Not enough magic.'
    case 'scorch': return 'You are standing in fire.'
    default: return null
  }
}

/** Health and magic, as bars over the top left of the view. */
function Bars({ hp, mp }: { hp: number; mp: number }) {
  return (
    <div className="pointer-events-none absolute top-3 left-3 grid w-[min(46%,15rem)] gap-1.5" data-testid="dungeon-bars">
      <Bar label="Health" value={hp} max={MAX_HP} color="var(--color-health)" low={hp < 30}>
        <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.2 1.8-2 3.3-3.2 5.4-3.2 3.6 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z" />
      </Bar>
      <Bar label="Magic" value={mp} max={MAX_MP} color="var(--color-magic)">
        <path d="M12 2l2.2 6.3L20.5 9l-5 4.1L17 20l-5-3.7L7 20l1.5-6.9L3.5 9l6.3-.7z" />
      </Bar>
    </div>
  )
}

function Bar({ label, value, max, color, low, children }: { label: string; value: number; max: number; color: string; low?: boolean; children: ReactNode }) {
  const v = Math.round(value)
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={v} aria-valuetext={`${v} of ${max}`} className="flex items-center gap-1.5">
      <svg aria-hidden viewBox="0 0 24 24" className={`size-4 flex-none ${low ? 'dungeon-low' : ''}`} style={{ fill: color }}>{children}</svg>
      <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-black/55 ring-1 ring-white/25">
        <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-150" style={{ width: `${(100 * Math.max(0, value)) / max}%`, background: color }} />
      </div>
      <span className="w-7 text-right text-xs tabular-nums text-ink">{v}</span>
    </div>
  )
}

/** A round button over the view for touch (and mouse): press and hold to keep swinging. Keys do the same. */
function ActionButton({ label, sub, tone, big, disabled, onHold, children }: { label: string; sub?: string; tone: 'sword' | 'fire' | 'frost'; big?: boolean; disabled?: boolean; onHold: (on: boolean) => void; children: ReactNode }) {
  const id = useRef<number | null>(null)
  const end = (e: PointerEvent) => { if (id.current === e.pointerId) { id.current = null; onHold(false) } }
  return (
    <button
      type="button"
      aria-label={sub ? `${label} (costs ${sub})` : label}
      aria-disabled={disabled || undefined}
      data-testid={`dungeon-${tone}`}
      className={`grid touch-none place-items-center rounded-full border shadow-lg backdrop-blur-sm transition-transform select-none active:scale-95 ${big ? 'size-20' : 'size-14'} ${
        tone === 'sword' ? 'border-white/40 bg-white/20 text-white hover:bg-white/30' : tone === 'fire' ? 'border-orange-200/50 bg-orange-500/30 text-orange-100 hover:bg-orange-500/40' : 'border-sky-200/50 bg-sky-400/25 text-sky-100 hover:bg-sky-400/35'
      } ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
      onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); id.current = e.pointerId; onHold(true) }}
      onPointerUp={end}
      onPointerCancel={end}
      onClick={(e) => { if (e.detail === 0) { onHold(true); onHold(false) } }}
    >
      <svg aria-hidden viewBox="0 0 24 24" className={big ? 'size-8' : 'size-6'} fill="currentColor">{children}</svg>
    </button>
  )
}

function Overlay({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-black/45 backdrop-blur-[2px]" data-testid="dungeon-overlay">
      <div role="group" aria-label={title} className="flex max-w-xs flex-col items-center gap-3 rounded-2xl bg-paper/90 px-6 py-5 text-center shadow-xl">
        <p className="font-display text-2xl text-ink">{title}</p>
        {children}
      </div>
    </div>
  )
}

/** A thumb stick for touch (and mouse): push up to run, down to back off, sideways to turn. Keys do the same, so it's hidden from screen readers. */
function Stick({ onChange }: { onChange: (v: { forward: number; turn: number }) => void }) {
  const pad = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState<[number, number]>([0, 0])
  const id = useRef<number | null>(null)
  const move = (x: number, y: number) => {
    const r = pad.current!.getBoundingClientRect()
    const R = r.width / 2
    let dx = (x - (r.left + R)) / R, dy = (y - (r.top + R)) / R
    const d = Math.hypot(dx, dy)
    if (d > 1) { dx /= d; dy /= d }
    setKnob([dx, dy])
    const dead = (v: number) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85)
    onChange({ forward: dead(-dy), turn: dead(dx) })
  }
  const end = () => { id.current = null; setKnob([0, 0]); onChange({ forward: 0, turn: 0 }) }
  // let go if it goes away mid-push (the hall being rebuilt), so the hero doesn't keep running
  const last = useRef(onChange)
  last.current = onChange
  useEffect(() => () => last.current({ forward: 0, turn: 0 }), [])
  return (
    <div
      ref={pad}
      aria-hidden
      data-testid="dungeon-stick"
      className="absolute bottom-3 left-3 size-28 cursor-grab touch-none rounded-full border border-white/25 bg-black/25 backdrop-blur-[2px] active:cursor-grabbing max-sm:size-24"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); id.current = e.pointerId; move(e.clientX, e.clientY) }}
      onPointerMove={(e) => { if (id.current === e.pointerId) move(e.clientX, e.clientY) }}
      onPointerUp={(e) => { if (id.current === e.pointerId) end() }}
      onPointerCancel={(e) => { if (id.current === e.pointerId) end() }}
    >
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 size-11 rounded-full border border-white/50 bg-white/35 shadow"
        style={{ transform: `translate(calc(-50% + ${knob[0] * 2.5}rem), calc(-50% + ${knob[1] * 2.5}rem))` }}
      />
    </div>
  )
}
