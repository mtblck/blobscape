import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Tabs } from './ui.tsx'
import { recordName, type Recorded, type Recording } from './record.ts'

/** For the box inside a tab: its sections (each direct child) stand apart, with a light rule between them. */
export const TAB_SECTIONS = 'grid gap-5 pt-1 [&>*+*]:border-t [&>*+*]:border-rule-soft [&>*+*]:pt-5'

/**
 * The layout every experiment shares: the preview on the left, staying in sight as the page scrolls,
 * and one panel of options on the right, split into tabs. On a narrow screen the preview sits on top
 * and stays there, shorter, with the tabs scrolling beneath it. The two columns are the same size on
 * every page. Anything that does not act on the preview (a write-up, a finished sheet) goes in a card
 * below, outside this.
 */
export function Workbench({ viewLabel, view, status, tabsLabel, tabs, footer, fullScreenAt = 'bottom-3 left-3 max-sm:bottom-2 max-sm:left-2' }: {
  /** Names the preview region for screen readers. */
  viewLabel: string
  /** The canvas and whatever lies over it. It fills a positioned box. */
  view: ReactNode
  /** A line under the preview: counts, sizes, what is being drawn. */
  status?: ReactNode
  tabsLabel: string
  tabs: { id: string; label: string; content: ReactNode }[]
  /** Stays at the foot of the panel whichever tab is open: what you do with the result (save it, send it on). */
  footer?: ReactNode
  /** Where on the preview the full screen button sits (position classes): bottom left unless a game's thumb stick is there. */
  fullScreenAt?: string
}) {
  const frame = useRef<HTMLDivElement>(null)
  const pictures = useRef<HTMLDivElement>(null)
  const { full, toggle } = useFullScreen(frame)
  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start lg:gap-x-5">
      <section aria-label={viewLabel} className={`sticky top-14 lg:top-[4.5rem] max-lg:[@media(max-height:560px)]:static ${full === 'window' ? 'z-50' : 'z-20'}`}>
        <div ref={frame} data-full={full || undefined} className={`case flex flex-col overflow-hidden bg-paper ring-1 ring-rule ${full === 'window' ? 'fixed inset-0 z-50' : 'relative rounded-2xl'}`}>
          <div ref={pictures} className={`relative ${full ? 'min-h-0 flex-1' : 'h-[45svh] min-h-[240px] lg:aspect-[4/3] lg:h-auto lg:max-h-[calc(100dvh-9rem)] lg:w-full'}`}>
            {view}
            <div className={`absolute flex items-center gap-1.5 ${fullScreenAt}`}>
              <button type="button" aria-label={full ? 'Leave full screen' : 'Full screen'} title={full ? 'Leave full screen' : 'Full screen'} onClick={toggle} data-testid="full-screen" className="zoom-btn">
                <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  {full ? <path d="M6 2.5V6H2.5M10 2.5V6h3.5M6 13.5V10H2.5M10 13.5V10h3.5" /> : <path d="M2.5 6V2.5H6M13.5 6V2.5H10M2.5 10v3.5H6M13.5 10v3.5H10" />}
                </svg>
              </button>
              <RecordButton view={pictures} />
            </div>
          </div>
          {status && <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-rule-soft px-4 py-2 text-xs leading-relaxed text-ink-muted sm:text-sm">{status}</div>}
        </div>
      </section>
      <section aria-label="Options" inert={full === 'window'} className="stack-controls rounded-2xl border border-rule bg-paper-sunk/60 px-4 pt-2 pb-5 sm:px-5">
        <Tabs label={tabsLabel} tabs={tabs} />
        {footer && <div className="mt-5 border-t border-rule pt-5">{footer}</div>}
      </section>
    </div>
  )
}

/**
 * Full screen for the preview. Where the browser allows an element to go full screen it does; where it
 * does not (Safari on iPhone), the preview fills the window instead, and Escape or the button brings it back.
 */
export function useFullScreen(frame: React.RefObject<HTMLDivElement | null>) {
  const [full, setFull] = useState<false | 'screen' | 'window'>(false)
  useEffect(() => {
    const onChange = () => setFull((f) => (document.fullscreenElement === frame.current ? 'screen' : f === 'screen' ? false : f))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [frame])
  useEffect(() => {
    if (full !== 'window') return
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setFull(false) }
    // the page behind must not scroll under a preview that fills the window
    const was = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    // and the floating tip button must not sit on a game's buttons (theme.css hides it while this is set)
    document.documentElement.dataset.full = 'window'
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); document.documentElement.style.overflow = was; delete document.documentElement.dataset.full }
  }, [full])
  const toggle = useCallback(() => {
    const el = frame.current
    if (!el) return
    if (document.fullscreenElement === el) { void document.exitFullscreen(); return }
    if (full === 'window') { setFull(false); return }
    if (el.requestFullscreen && document.fullscreenEnabled) el.requestFullscreen().catch(() => setFull('window'))
    else setFull('window')
  }, [frame, full])
  return { full, toggle }
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/**
 * Records the preview as a video (record.ts): only what is drawn, with none of the buttons over it. Press it, change
 * what you like (turn the view, pick another look), press again and the file is saved. `?record=webm` asks for the
 * browser's own recorder in place of an MP4.
 */
function RecordButton({ view }: { view: React.RefObject<HTMLDivElement | null> }) {
  const [state, setState] = useState<'idle' | 'starting' | 'recording' | 'saving'>('idle')
  const [seconds, setSeconds] = useState(0)
  const [note, setNote] = useState('')
  const recording = useRef<Recording | null>(null)
  const save = useCallback((r: Recorded | Error) => {
    recording.current = null
    setState('idle')
    if (r instanceof Error) { setNote(`The video could not be made: ${r.message}.`); return }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(r.bytes)
    a.download = recordName(location.pathname, new Date(), r.ext)
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 60000)
    setNote(`Saved ${a.download}`)
  }, [])
  // leaving the page ends a recording
  useEffect(() => () => recording.current?.cancel(), [])
  useEffect(() => {
    if (state !== 'recording') return
    const id = setInterval(() => setSeconds(recording.current?.seconds ?? 0), 250)
    return () => clearInterval(id)
  }, [state])
  useEffect(() => {
    if (!note) return
    const id = setTimeout(() => setNote(''), 6000)
    return () => clearTimeout(id)
  }, [note])
  const press = async () => {
    if (state === 'recording') {
      const r = recording.current
      if (!r) return
      setState('saving')
      save(await r.stop().catch((e: unknown) => (e instanceof Error ? e : new Error(String(e)))))
      return
    }
    if (state !== 'idle' || !view.current) return
    setState('starting')
    setNote('')
    setSeconds(0)
    try {
      const { startRecording } = await import('./record.ts')
      recording.current = await startRecording(view.current, { kind: new URLSearchParams(location.search).get('record') === 'webm' ? 'webm' : undefined, onEnd: save })
      setState('recording')
    } catch (e) {
      setState('idle')
      setNote(`The video could not be started: ${e instanceof Error ? e.message : String(e)}.`)
    }
  }
  const on = state === 'recording'
  const label = on ? `Stop recording and save the video (${clock(seconds)} so far)` : state === 'saving' ? 'Saving the video' : 'Record a video of this view'
  return (
    <>
      <button type="button" aria-label={label} title={on ? 'Stop and save the video' : 'Record a video of this view'} aria-pressed={on} disabled={state === 'starting' || state === 'saving'} onClick={() => void press()} data-testid="record" className={`zoom-btn ${on ? '!w-auto gap-1.5 px-2.5' : ''}`}>
        {on
          ? <><span aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-[#e5484d]" /><span aria-hidden className="text-xs tabular-nums">{clock(seconds)}</span></>
          : <span aria-hidden className={`h-2.5 w-2.5 rounded-full bg-[#e5484d] ${state === 'idle' ? '' : 'opacity-50'}`} />}
      </button>
      <span role="status" data-testid="record-note" className={note ? 'rounded-full bg-paper/80 px-2.5 py-1 text-xs text-ink' : 'sr-only'}>{note || (on ? 'Recording.' : '')}</span>
    </>
  )
}
