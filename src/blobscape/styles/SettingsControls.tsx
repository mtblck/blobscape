import { Fragment, type ReactNode } from 'react'
import { Button, Chip, Field, Slider, Toggle } from '../../shared/ui.tsx'
import { shownSettings, valueWords, type Shows, type StyleDef, type Tab } from './catalog.ts'

/** What a page says about one choice setting whose chips depend on its subject (a backdrop that may be the scene's own sky, a scene's palettes). */
export interface ChoiceShown { options?: readonly { id: string | number; label: string }[]; active?: string | number; testid?: string; /** Drawn under the chips in the hint's place (a palette's strip of colors). */ under?: ReactNode }

/** A setting the page holds for now (the sky is behind whatever the switch says; nothing rocks under reduced motion). */
export interface Locked { /** What the control shows meanwhile, if not the setting's own value. */ value?: boolean; why?: string }

interface Props<V> {
  def: StyleDef<V>
  value: V
  onChange: (change: Partial<V>) => void
  /** The style on show and what the subject has: a setting's `when` goes by it. */
  on: Shows
  /** The page, for a setting that is one experiment's own try (`trial`). */
  page?: string
  /** Which of the style's tabs to draw, where its settings are spread over more than one. */
  tab?: Tab
  /** Chips the page lists itself, by the setting's key. */
  choices?: Partial<Record<keyof V & string, ChoiceShown>>
  /** Settings the page holds still, by key. */
  locked?: Partial<Record<keyof V & string, Locked>>
  /** Settings this page does not offer (it has them elsewhere, or they would do nothing here). */
  skip?: readonly (keyof V & string)[]
}

const Note = ({ children }: { children: ReactNode }) => <p className="mt-1.5 text-xs text-ink-faint">{children}</p>

/**
 * A style's controls, drawn from the catalog: a slider for a range, chips for a choice, a switch for a toggle, each
 * with the catalog's label, limits and words (or as the setting's `draw` says). Renders a run of siblings, so the page
 * wraps them as one section or leaves each its own.
 */
export function SettingsControls<V>({ def, value, onChange, on, page, tab, choices, locked, skip }: Props<V>) {
  const v = value as Record<string, unknown>
  const set = (key: string, to: unknown) => onChange({ [key]: to } as Partial<V>)
  return (
    <>
      {shownSettings(def, value, on, page, tab).filter((s) => !skip?.includes(s.key)).map((s) => {
        const lock = locked?.[s.key], why = s.held?.(on)
        const hint = why ?? lock?.why ?? (typeof s.hint === 'function' ? s.hint(on) : s.hint)
        const off = !!why || !!lock
        const switched = (label: string, checked: boolean, change: (to: boolean) => void, about?: string) => (
          <div data-testid={s.testid}>
            <Toggle label={label} checked={lock?.value ?? checked} onChange={change} disabled={off} />
            {(why ?? lock?.why ?? about) && <Note>{why ?? lock?.why ?? about}</Note>}
          </div>
        )
        const chips = (options: readonly { id: string | number; label: string }[], active: string | number, pick: (id: string | number) => void, about?: ReactNode, testid?: string) => (
          <Field label={s.label}>
            <div className="flex flex-wrap gap-1.5" data-testid={testid}>
              {options.map((o) => <Chip key={o.id} active={active === o.id} onClick={() => pick(o.id)}>{o.label}</Chip>)}
            </div>
            {about}
          </Field>
        )
        let control: ReactNode
        if (s.draw?.kind === 'toggle') {
          const d = s.draw
          control = switched(s.label, d.at(value), (to) => onChange(d.set(to, on)), hint)
        } else if (s.draw?.kind === 'choice') {
          const d = s.draw
          control = chips(d.options, d.at(value), (id) => onChange(d.set(String(id))), hint && <Note>{hint}</Note>, s.testid)
        } else if (s.kind === 'range') {
          control = <Slider label={s.label} value={v[s.key] as number} min={s.min} max={s.max} step={s.step} onChange={(to) => set(s.key, to)} format={(n) => valueWords(s, n)} hint={hint} />
        } else if (s.kind === 'choice') {
          const shown = choices?.[s.key], options = shown?.options ?? s.options, active = shown?.active ?? (v[s.key] as string | number)
          const about = s.options.find((o) => o.id === active)?.about ?? hint
          control = chips(options, active, (id) => set(s.key, id), shown?.under ?? (about && <Note>{about}</Note>), shown?.testid ?? s.testid)
        } else if (s.kind === 'toggle') {
          const about = typeof s.about === 'function' ? s.about(on.style, on) : s.about
          control = switched(s.label, (v[s.key] as boolean | null) ?? !!s.auto?.(on.style), (to) => set(s.key, to), about)
        } else {
          control = (
            <div>
              <Button small onClick={() => set(s.key, (v[s.key] as number) + 1)}>{s.label}</Button>
              {hint && <Note>{hint}</Note>}
            </div>
          )
        }
        return <Fragment key={s.key}>{control}</Fragment>
      })}
    </>
  )
}
