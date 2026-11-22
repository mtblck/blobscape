import { Fragment, type ReactNode } from 'react'
import { Button, Chip, Field, Slider, Toggle } from '../../shared/ui.tsx'
import { shownSettings, valueWords, type Shows, type StyleDef } from './catalog.ts'

/** What a page says about one choice setting whose chips depend on its subject (a backdrop that may be the scene's own sky). */
export interface ChoiceShown { options?: readonly { id: string | number; label: string }[]; active?: string | number }

interface Props<V> {
  def: StyleDef<V>
  value: V
  onChange: (change: Partial<V>) => void
  /** The style on show and what the subject has: a setting's `when` goes by it. */
  on: Shows
  /** The page, for a setting that is one experiment's own try (`trial`). */
  page?: string
  /** Chips the page lists itself, by the setting's key. */
  choices?: Partial<Record<keyof V & string, ChoiceShown>>
}

/**
 * A style's controls, drawn from the catalog: a slider for a range, chips for a choice, a switch for a toggle, each
 * with the catalog's label, limits and words. Renders a run of siblings, so the page wraps them as one section or
 * leaves each its own.
 */
export function SettingsControls<V>({ def, value, onChange, on, page, choices }: Props<V>) {
  const v = value as Record<string, unknown>
  const set = (key: string, to: unknown) => onChange({ [key]: to } as Partial<V>)
  return (
    <>
      {shownSettings(def, value, on, page).map((s) => {
        let control: ReactNode
        if (s.kind === 'range') {
          control = <Slider label={s.label} value={v[s.key] as number} min={s.min} max={s.max} step={s.step} onChange={(to) => set(s.key, to)} format={(n) => valueWords(s, n)} hint={s.hint} />
        } else if (s.kind === 'choice') {
          const shown = choices?.[s.key], options = shown?.options ?? s.options, active = shown?.active ?? (v[s.key] as string | number)
          const about = s.options.find((o) => o.id === active)?.about ?? s.hint
          control = (
            <Field label={s.label}>
              <div className="flex flex-wrap gap-1.5" data-testid={s.testid}>
                {options.map((o) => <Chip key={o.id} active={active === o.id} onClick={() => set(s.key, o.id)}>{o.label}</Chip>)}
              </div>
              {about && <p className="mt-1.5 text-xs text-ink-faint">{about}</p>}
            </Field>
          )
        } else if (s.kind === 'toggle') {
          const about = typeof s.about === 'function' ? s.about(on.style) : s.about
          const checked = (v[s.key] as boolean | null) ?? !!s.auto?.(on.style)
          control = (
            <div data-testid={s.testid}>
              <Toggle label={s.label} checked={checked} onChange={(to) => set(s.key, to)} />
              {about && <p className="mt-1.5 text-xs text-ink-faint">{about}</p>}
            </div>
          )
        } else {
          control = (
            <div>
              <Button small onClick={() => set(s.key, (v[s.key] as number) + 1)}>{s.label}</Button>
              {s.hint && <p className="mt-1.5 text-xs text-ink-faint">{s.hint}</p>}
            </div>
          )
        }
        return <Fragment key={s.key}>{control}</Fragment>
      })}
    </>
  )
}
