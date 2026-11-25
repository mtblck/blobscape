import { SiteHeader } from '../shared/SiteHeader.tsx'
import { type Route, COMING, LESSONS, LESSON_COUNT, LESSON_GOALS, PARTS, href, useLinkNavigation, useRoute } from './routes.ts'
import { doneGoals, resetProgress } from './progress.ts'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { Landing } from './Landing.tsx'
import { TipButton, usePageMeta } from './Chrome.tsx'
import { Footer } from '../shared/Footer.tsx'
import { OneBlob } from './lessons/OneBlob.tsx'
import { Footprint } from './lessons/Footprint.tsx'
import { Order } from './lessons/Order.tsx'
import { Many } from './lessons/Many.tsx'
import { Angle } from './lessons/Angle.tsx'
import { Paint } from './lessons/Paint.tsx'
import { Formats } from './lessons/Formats.tsx'
import { Break } from './lessons/Break.tsx'
import { OneBone } from './lessons/OneBone.tsx'
import { Weights } from './lessons/Weights.tsx'
import { Twist } from './lessons/Twist.tsx'
import { Morphs } from './lessons/Morphs.tsx'
import { FirstCreature } from './lessons/FirstCreature.tsx'
import { SceneData } from './lessons/SceneData.tsx'
import { PixelArt } from './lessons/PixelArt.tsx'
import { Fur } from './lessons/Fur.tsx'
import { Walk } from './lessons/Walk.tsx'
import { FeetOnTheGround } from './lessons/Feet.tsx'
import { Model } from './lessons/Model.tsx'
import { Shoot } from './lessons/Shoot.tsx'
import { Fuzzy } from './lessons/Fuzzy.tsx'
import { Floaters } from './lessons/Floaters.tsx'
import { Lighting } from './lessons/Lighting.tsx'
import { Shimmer } from './lessons/Shimmer.tsx'
import { Sandbox } from './Sandbox.tsx'
import { Creature } from './Creature.tsx'
import { ForestWalk } from './ForestWalk.tsx'
import { Clockwork } from './Clockwork.tsx'
import { ShapeShifter } from './ShapeShifter.tsx'
import { WadingPond } from './WadingPond.tsx'
import { SandSnowGoo } from './SandSnowGoo.tsx'
import { BrushInk } from './BrushInk.tsx'
import { TextMode } from './TextMode.tsx'
import { FourWays } from './FourWays.tsx'
import { DayNight } from './DayNight.tsx'
import { Bouquets } from './Bouquets.tsx'
import { Islands } from './Islands.tsx'
import { UglySweater } from './UglySweater.tsx'
import { GlassJellyfish } from './GlassJellyfish.tsx'
import { PixelDiorama } from './PixelDiorama.tsx'
import { SceneCreator } from './SceneCreator.tsx'
import { ScanStudio } from './ScanStudio.tsx'
import { DungeonRun } from './DungeonRun.tsx'
import { Experiments } from './Experiments.tsx'
import { useEffect, useState } from 'react'
import { Toaster, clearToasts } from '../shared/Toast.tsx'
import { Contact } from './Contact.tsx'
import { Engine } from './Engine.tsx'
import { Spec } from './Spec.tsx'
import { EngineApi } from './api/EngineApi.tsx'
import { PostPage, WhatsNew } from './WhatsNew.tsx'

const PAGES: Record<string, () => React.JSX.Element> = { 'first-creature': FirstCreature, 'scene-data': SceneData, 'pixel-art': PixelArt, 'one-blob': OneBlob, footprint: Footprint, order: Order, many: Many, angle: Angle, paint: Paint, formats: Formats, break: Break, 'one-bone': OneBone, weights: Weights, twist: Twist, walk: Walk, feet: FeetOnTheGround, model: Model, morphs: Morphs, fur: Fur, shoot: Shoot, fuzzy: Fuzzy, floaters: Floaters, lighting: Lighting, shimmer: Shimmer }

/** The whole site. `route` is only for prerendering (scripts/prerender.ts), where there is no address bar to read. */
/** Pages for reading, where the tip button shows whole; on the rest, which have controls, it is a circle. */
const READING = new Set<Route['page']>(['home', 'lessons', 'experiments', 'engine', 'spec', 'api', 'contact', 'news', 'post', 'notfound'])

export function App({ route: at }: { route?: Route } = {}) {
  const route = useRoute(at)
  const key = route.page === 'lesson' ? route.id : route.page === 'post' ? `post:${route.id}` : route.page
  const Lesson = route.page === 'lesson' ? PAGES[route.id] : null
  usePageMeta(route)
  useLinkNavigation()
  // A toast belongs to the page that raised it
  useEffect(() => clearToasts(), [key])
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader here={route.page === 'notfound' ? undefined : href(route)} wide={route.page === 'sandbox' || route.page === 'creator'} />
      {/* Keyed by page, so each one mounts fresh: its own view, its own state */}
      <main id="main" key={key} className={route.page === 'sandbox' || route.page === 'creator' ? 'w-full flex-1' : 'mx-auto w-full max-w-7xl flex-1 px-4 pb-16'}>
        {route.page === 'sandbox' ? <Sandbox /> : route.page === 'creator' ? <SceneCreator /> : route.page === 'creature' ? <Creature /> : route.page === 'forest' ? <ForestWalk /> : route.page === 'pond' ? <WadingPond /> : route.page === 'clockwork' ? <Clockwork /> : route.page === 'shift' ? <ShapeShifter /> : route.page === 'flow' ? <SandSnowGoo /> : route.page === 'brush' ? <BrushInk /> : route.page === 'text' ? <TextMode /> : route.page === 'fourways' ? <FourWays /> : route.page === 'daynight' ? <DayNight /> : route.page === 'bouquet' ? <Bouquets /> : route.page === 'islands' ? <Islands /> : route.page === 'jelly' ? <GlassJellyfish /> : route.page === 'sweater' ? <UglySweater /> : route.page === 'diorama' ? <PixelDiorama /> : route.page === 'scan' ? <ScanStudio /> : route.page === 'dungeon' ? <DungeonRun /> : Lesson ? <Lesson /> : route.page === 'lessons' ? <LessonList /> : route.page === 'experiments' ? <Experiments /> : route.page === 'engine' ? <Engine /> : route.page === 'spec' ? <Spec /> : route.page === 'api' ? <EngineApi /> : route.page === 'contact' ? <Contact /> : route.page === 'news' ? <WhatsNew /> : route.page === 'post' ? <PostPage id={route.id} /> : route.page === 'notfound' ? <NotFound /> : <Landing />}
      </main>
      <Footer />
      <Toaster />
      {/* not in the prerendered HTML: it fades in once the app is running */}
      {!at && <TipButton small={!READING.has(route.page)} />}
    </div>
  )
}

/** Every lesson with its progress, in parts: where "See all … lessons" and each lesson's kicker lead. */
function LessonList() {
  const h1 = useFocusHeading()
  const [, refresh] = useState(0)
  // Only goals that still exist count, in case a lesson's goals change
  const progress = LESSONS.map((l) => LESSON_GOALS[l.id].filter((g) => doneGoals(l.id).has(g.id)).length)
  const any = progress.some((n) => n > 0)
  return (
    <div className="max-w-3xl">
      <Crumbs here="Lessons" />
      <div className="pt-6 pb-8">
        <h1 ref={h1} tabIndex={-1} className="font-display text-5xl outline-none">Lessons</h1>
        <p className="mt-4 text-xl leading-relaxed text-ink-muted">
          A Gaussian splat is a 3D scene made of nothing but soft, see-through, colored blobs. Start with one, learn what each of its
          numbers does, pile up thousands, then give them bones and make them walk.
        </p>
      </div>

      <section aria-labelledby="lessons-title">
        <div className="flex items-baseline justify-between">
          <h2 id="lessons-title" tabIndex={-1} className="font-display text-3xl outline-none">All {LESSON_COUNT}</h2>
          {any && (
            <button
              type="button"
              onClick={() => {
                if (!window.confirm('Clear every ticked goal in this browser?')) return
                resetProgress()
                refresh((n) => n + 1)
                // The button goes away, so give focus somewhere sensible
                document.getElementById('lessons-title')?.focus()
              }}
              className="text-sm text-ink-faint hover:text-accent"
            >
              Reset progress
            </button>
          )}
        </div>
        {PARTS.map((part, p) => {
          const end = PARTS[p + 1]?.from ?? LESSONS.length
          return (
            <section key={part.title} aria-labelledby={`part-${p}`} className="mt-6">
              <h3 id={`part-${p}`} className="font-display text-xl text-ink">Part {p + 1}: {part.title}</h3>
              <p className="mt-1 text-sm text-ink-muted">{part.summary}</p>
              <ol start={part.from + 1} className="mt-3">
                {LESSONS.slice(part.from, end).map((l, k) => {
                  const i = part.from + k
                  return (
                    <li key={l.id} className="border-t border-rule">
                      <a href={href({ page: 'lesson', id: l.id })} className="group flex gap-4 py-5">
                        <span aria-hidden className="w-8 shrink-0 font-display text-2xl text-ink-faint group-hover:text-accent">{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline justify-between gap-x-4">
                            <span className="font-display text-2xl group-hover:text-accent">{l.title} →</span>
                            <span className="text-xs tabular-nums text-ink-faint">{progress[i]} of {LESSON_GOALS[l.id].length} goals</span>
                          </span>
                          <span className="mt-1 block text-ink-muted">{l.summary}</span>
                        </span>
                      </a>
                    </li>
                  )
                })}
              </ol>
            </section>
          )
        })}
        {COMING.length > 0 && <ol start={LESSONS.length + 1}>
          {COMING.map((l, i) => (
            <li key={l.title} className="flex gap-4 border-t border-rule py-5 text-ink-faint">
              <span aria-hidden className="w-8 shrink-0 font-display text-2xl">{LESSONS.length + i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="font-display text-2xl">{l.title}</span> <span className="text-xs uppercase tracking-wider">coming later</span>
                <span className="mt-1 block">{l.summary}</span>
              </span>
            </li>
          ))}
        </ol>}
      </section>

      <section aria-labelledby="sandbox-title" className="mt-10 rounded-lg border border-rule bg-paper-sunk p-6">
        <h2 id="sandbox-title" className="font-display text-3xl">Sandbox</h2>
        <p className="mt-2 text-ink-muted">Spray blobs into space, select and recolor them, rip holes in a sample object, and switch on x-ray to see what it's really made of. Every lesson can open its scene here too.</p>
        <a href={href({ page: 'sandbox' })} className="mt-4 inline-block rounded bg-accent px-4 py-2 font-medium text-paper transition-colors hover:bg-accent-ink">Open the sandbox →</a>
      </section>
    </div>
  )
}

/** Any path that isn't a page. Vercel serves the prerendered 404.html for it; this is what the app shows there. */
function NotFound() {
  const h1 = useFocusHeading()
  return (
    <div className="max-w-2xl py-16">
      <h1 ref={h1} tabIndex={-1} className="font-display text-5xl outline-none">That page isn’t here</h1>
      <p className="mt-4 text-xl leading-relaxed text-ink-muted">The link may be old, or mistyped. Every lesson is on the lesson list.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <a href={href({ page: 'lessons' })} className="inline-flex min-h-11 items-center rounded-lg bg-accent px-5 font-medium text-paper no-underline transition-colors hover:bg-accent-ink">See the lessons</a>
        <a href={href({ page: 'home' })} className="inline-flex min-h-11 items-center rounded-lg border border-rule px-5 font-medium text-ink no-underline transition-colors hover:border-ink-faint hover:bg-paper-sunk">Front page</a>
      </div>
    </div>
  )
}
