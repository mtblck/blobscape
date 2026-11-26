/**
 * Veggie Slayer's sounds, made on the spot with Web Audio (no files): a squelchy pop for a burst, a crack for a
 * pumpkin's side, a chime for the golden sprout, a sad honk for a treat, a thud for a heart lost and a fanfare that
 * falls flat at the end. Nothing plays until the visitor has pressed Play (browsers start audio only after a press).
 */
export type Cue = 'pop' | 'crack' | 'gold' | 'treat' | 'miss' | 'combo' | 'over'

type Ctx = AudioContext

export class Sounds {
  private ctx?: Ctx
  on = true

  /** Starts audio; call it from a press. */
  wake() {
    if (typeof window === 'undefined') return
    try {
      this.ctx ??= new AudioContext()
      if (this.ctx.state === 'suspended') void this.ctx.resume()
    } catch {
      this.ctx = undefined
    }
  }

  play(cue: Cue, pitch = 1) {
    const c = this.ctx
    if (!this.on || !c || c.state !== 'running') return
    const t = c.currentTime
    switch (cue) {
      case 'pop': {
        this.tone(c, t, 'square', 520 * pitch, 140 * pitch, 0.12, 0.16)
        this.noise(c, t, 0.09, 0.22, 1800)
        break
      }
      case 'crack': this.noise(c, t, 0.12, 0.3, 900); this.tone(c, t, 'triangle', 180, 90, 0.12, 0.2); break
      case 'gold': [0, 0.07, 0.14, 0.21].forEach((d, i) => this.tone(c, t + d, 'triangle', 880 * 2 ** (i / 4), 880 * 2 ** (i / 4), 0.18, 0.12)); break
      case 'treat': this.tone(c, t, 'sawtooth', 330, 150, 0.4, 0.12); break
      case 'miss': this.tone(c, t, 'sine', 140, 60, 0.25, 0.3); break
      case 'combo': [0, 0.06, 0.12].forEach((d, i) => this.tone(c, t + d, 'square', 600 * 2 ** (i / 3) * pitch, 600 * 2 ** (i / 3) * pitch, 0.08, 0.08)); break
      case 'over': [0, 0.18, 0.36].forEach((d, i) => this.tone(c, t + d, 'triangle', 392 / 2 ** (i / 6), 392 / 2 ** ((i + 1) / 6), 0.22, 0.16)); break
    }
  }

  private tone(c: Ctx, at: number, type: OscillatorType, from: number, to: number, long: number, loud: number) {
    const o = c.createOscillator(), g = c.createGain()
    o.type = type
    o.frequency.setValueAtTime(from, at)
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + long)
    g.gain.setValueAtTime(loud, at)
    g.gain.exponentialRampToValueAtTime(0.0001, at + long)
    o.connect(g).connect(c.destination)
    o.start(at)
    o.stop(at + long + 0.02)
  }

  private noise(c: Ctx, at: number, long: number, loud: number, cut: number) {
    const n = Math.ceil(c.sampleRate * long), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
    s.buffer = buf
    f.type = 'lowpass'
    f.frequency.value = cut
    g.gain.value = loud
    s.connect(f).connect(g).connect(c.destination)
    s.start(at)
  }

  close() { void this.ctx?.close(); this.ctx = undefined }
}
