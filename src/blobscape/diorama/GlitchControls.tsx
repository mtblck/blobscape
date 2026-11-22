import type { Dispatch, SetStateAction } from 'react'
import type { GlitchChoice } from '../glitchLooks.ts'
import { GLITCH_DEF } from '../styles/catalog.ts'
import { SettingsControls } from '../styles/SettingsControls.tsx'

/** Tech glitch's settings, for the Style tab of Diorama and Scene Creator: drawn from the catalog. */
export function GlitchControls({ glitch, setGlitch, calm }: { glitch: GlitchChoice; setGlitch: Dispatch<SetStateAction<GlitchChoice>>; calm: boolean }) {
  return (
    <div className="space-y-4" data-testid="diorama-glitch">
      {calm && <p className="text-xs text-ink-faint">Your device asks for less motion, so the picture holds still and no burst comes.</p>}
      <SettingsControls def={GLITCH_DEF} value={glitch} onChange={(c) => setGlitch((g) => ({ ...g, ...c }))} on={{ style: 'glitch' }} />
    </div>
  )
}
