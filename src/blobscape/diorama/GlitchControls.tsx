import type { Dispatch, SetStateAction } from 'react'
import { Button, Chip, Field, Slider, Toggle } from '../../shared/ui.tsx'
import { GLITCH_AMOUNTS, GLITCH_PACE_CHOICES, type GlitchChoice } from '../glitchLooks.ts'

/** Tech glitch's settings, for the Style tab of Pixel Diorama and Scene Creator. */
export function GlitchControls({ glitch, setGlitch, calm }: { glitch: GlitchChoice; setGlitch: Dispatch<SetStateAction<GlitchChoice>>; calm: boolean }) {
  return (
    <div className="space-y-4" data-testid="diorama-glitch">
      <Field label="Bursts">
        <div className="flex flex-wrap gap-1.5">
          {GLITCH_AMOUNTS.map((a) => <Chip key={a.id} active={glitch.amount === a.amount} onClick={() => setGlitch((g) => ({ ...g, amount: a.amount }))}>{a.label}</Chip>)}
        </div>
        {calm && <p className="mt-1.5 text-xs text-ink-faint">Your device asks for less motion, so the picture holds still and no burst comes.</p>}
      </Field>
      <Slider label="Strength" value={glitch.strength} min={0.1} max={1} step={0.05} onChange={(strength) => setGlitch((g) => ({ ...g, strength }))} format={(v) => `${Math.round(v * 100)}%`} hint="How far rows slide, how far the colors split and how many blocks break up in a burst." />
      <Field label="Steps a second">
        <div className="flex flex-wrap gap-1.5">
          {GLITCH_PACE_CHOICES.map((p) => <Chip key={p} active={glitch.pace === p} onClick={() => setGlitch((g) => ({ ...g, pace: p }))}>{String(p)}</Chip>)}
        </div>
        <p className="mt-1.5 text-xs text-ink-faint">A burst jumps from one state to the next this often, with nothing in between.</p>
      </Field>
      <div className="grid gap-3">
        <Toggle label="Scanline jitter" checked={glitch.jitter} onChange={(jitter) => setGlitch((g) => ({ ...g, jitter }))} />
        <Toggle label="Color split" checked={glitch.split} onChange={(split) => setGlitch((g) => ({ ...g, split }))} />
        <Toggle label="Broken blocks" checked={glitch.blocks} onChange={(blocks) => setGlitch((g) => ({ ...g, blocks }))} />
      </div>
      <div>
        <Button small onClick={() => setGlitch((g) => ({ ...g, seed: g.seed + 1 }))}>New bursts</Button>
        <p className="mt-1.5 text-xs text-ink-faint">The bursts follow the scene's loop, so an exported loop joins up. This picks another run of them.</p>
      </div>
    </div>
  )
}
