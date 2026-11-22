import type { ReactNode } from 'react'
import { Chip, Field, Toggle } from '../../shared/ui.tsx'
import { TIMES, type TimeId } from '../timeOfDay.ts'
import { CLOUD_COVERS, WEATHERS, WINDS, type CloudId, type WeatherId, type WindId } from '../../splat-engine/skyRecipes.ts'

/**
 * The scene's own settings as controls (`SCENE` in catalog.ts lists them): the time of day, and the weather, wind and
 * clouds of the shared recipes. Every page that sets a scene in a time or under a weather draws these, so the chips,
 * their order and their words are written once. Each renders a run of sections.
 */

interface TimeProps {
  /** The time picked, or none for the scene as it is written. */
  time: TimeId | undefined
  onPick: (id: TimeId | undefined) => void
  /** Whether the scene can be set in a time at all (one out in space, or with a story of its own sky, can't). */
  timed?: boolean
  /** What the page calls a way of drawing: "style" or "look". */
  each?: string
  prefix: string
}

/** Time of day: the scene's own, then morning, afternoon and night. */
export function TimeControls({ time, onPick, timed = true, each = 'style', prefix }: TimeProps) {
  return (
    <Field label="Time of day">
      <div className="flex flex-wrap gap-1.5" data-testid={`${prefix}-time`}>
        <Chip active={!time || !timed} onClick={() => onPick(undefined)}>Scene's own</Chip>
        {timed && TIMES.map((t) => <Chip key={t.id} active={time === t.id} onClick={() => onPick(t.id)}>{t.label}</Chip>)}
      </div>
      <p className="mt-1.5 text-xs text-ink-faint">{!timed ? 'This scene keeps its own time of day.' : time ? `The scene under this time's sky and light, in every ${each}. Its lamps, lit windows and fires wait for the dark.` : `The scene as it was written, with everything lit. Pick a time to set it in a morning, an afternoon or a night, in every ${each}.`}</p>
    </Field>
  )
}

interface WeatherProps {
  /** The weather and cloud cover on show (a weather brings its own clouds, so at most one is set). */
  weather: WeatherId | undefined
  clouds: CloudId | undefined
  /** The wind asked for in place of the weather's own. */
  wind: WindId | undefined
  /** Whether the clouds float over the scene. */
  overhead: boolean
  /** A weather or a cover picked (or neither, with no id), or a wind. */
  onPick: (key: 'weather' | 'clouds' | 'wind', id: string | undefined) => void
  onOverhead: (on: boolean) => void
  /** The device asks for less motion: lightning is left out. */
  calm: boolean
  prefix: string
  /** Each under a heading of its own, full width, where the page's fields lay a label beside its control (Scene Creator's panel). */
  headed?: boolean
}

/** A control under its name: a field, or a heading over it. */
function Named({ label, headed, children }: { label: string; headed?: boolean; children: ReactNode }) {
  return headed ? <div role="group" aria-label={label}><h3 className="mb-2 text-sm font-semibold">{label}</h3>{children}</div> : <Field label={label}>{children}</Field>
}

/** Weather (cloud covers and weathers as one choice), wind, and whether the clouds float over the scene. */
export function WeatherControls({ weather, clouds, wind, overhead, onPick, onOverhead, calm, prefix, headed }: WeatherProps) {
  return (
    <>
      <Named label="Weather" headed={headed}>
        <div className="flex flex-wrap gap-1.5" data-testid={`${prefix}-weather`}>
          <Chip active={!weather && !clouds} onClick={() => onPick('weather', undefined)}>No weather</Chip>
          {CLOUD_COVERS.map((c) => <Chip key={c.id} active={!weather && clouds === c.id} onClick={() => onPick('clouds', c.id)}>{c.label}</Chip>)}
          {WEATHERS.map((w) => <Chip key={w.id} active={weather === w.id} onClick={() => onPick('weather', w.id)}>{w.label}</Chip>)}
        </div>
        <p className="mt-1.5 text-xs text-ink-faint">Each weather comes with its own clouds, light, haze and wind. The same recipes for every scene and every style, laid over the scene: the sky eases from one to the next without the scene being made again.{weather === 'thunderstorm' ? (calm ? ' Lightning is left out, as your device asks for less motion.' : ' Lightning flashes every few seconds.') : ''}</p>
      </Named>
      <Named label="Wind" headed={headed}>
        <div className="flex flex-wrap gap-1.5" data-testid={`${prefix}-wind`}>
          {WINDS.map((w, i) => <Chip key={w.id} active={wind ? wind === w.id : (WEATHERS.find((k) => k.id === weather)?.wind ?? 0) === i} onClick={() => onPick('wind', w.id)}>{i ? w.label : 'No wind'}</Chip>)}
        </div>
        <p className="mt-1.5 text-xs text-ink-faint">Wind blows rain, snow and falling leaves at a slant, in gusts, sways trees and stalks, and raises waves on a scene's water. Picking a weather brings its own wind back.</p>
      </Named>
      <div className="grid gap-1.5">
        <Toggle label="Clouds over the scene" checked={overhead} onChange={onOverhead} />
        <p className="text-xs text-ink-faint">{overhead ? 'The clouds float over the scene and rain and snow fall from under them.' : 'The clouds are left out: the sky still grays and darkens, and rain and snow fall in from over the top of the picture.'}</p>
      </div>
    </>
  )
}
