/** Knitting as the pages offer it (Matt's idea, 2026-11-23: an ugly Christmas sweater): its chip, the yarns and patterns, what the page's controls start at, and the look for the stage. */
import type { KnitLook } from '../../splat-core/knit.ts'

/** The chip beside the drawn looks (brushLooks.ts). */
export const KNIT = { id: 'knit' as const, label: 'Ugly sweater', note: 'Knitted: a grid of yarn stitches fixed on the screen, the picture in a few yarn colors, and bands of zigzags, stars and little trees knitted in above and below it.' }

const hex = (h: string): readonly [number, number, number] => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]

/** The sweaters: each one's yarns (sRGB 0–1), the body's first, then the pattern's main yarn and its second, then the rest the picture is knitted in. */
export const KNIT_SWEATERS: { id: string; label: string; yarns: readonly (readonly [number, number, number])[] }[] = [
  { id: 'red', label: 'Red', yarns: ['#c3222d', '#f4ecdb', '#1f8243', '#0f4d2b', '#e3ad2f', '#6f4222', '#8a1622', '#26262c', '#74b3d8', '#c9925a'].map(hex) },
  { id: 'navy', label: 'Navy', yarns: ['#1c2a4f', '#f4ecdb', '#c3222d', '#1f8243', '#0f4d2b', '#e3ad2f', '#6f4222', '#0d1222', '#74b3d8', '#c9925a'].map(hex) },
  { id: 'green', label: 'Green', yarns: ['#14502d', '#f4ecdb', '#c3222d', '#46a653', '#e3ad2f', '#6f4222', '#74121d', '#0a2414', '#74b3d8', '#c9925a'].map(hex) },
  { id: 'charcoal', label: 'Charcoal', yarns: ['#27272c', '#f5f1e8', '#c3222d', '#1f8243', '#0f4d2b', '#e3ad2f', '#6f4222', '#8d8d95', '#74b3d8', '#c9925a'].map(hex) },
  { id: 'cream', label: 'Cream', yarns: ['#f1e9d9', '#2f97d2', '#d0232f', '#27964a', '#0f4d2b', '#e3ad2f', '#6f4222', '#26262c', '#b9c6d2', '#c9925a'].map(hex) },
]

/** The patterns: each one's bands from the edge inward, ids of `MOTIFS` in knit.ts. A band too tall for the picture is left out. */
export const KNIT_PATTERNS: { id: string; label: string; bands: readonly string[] }[] = [
  { id: 'nordic', label: 'Nordic stars', bands: ['line', 'checks', 'line', 'star', 'zigzag'] },
  { id: 'forest', label: 'Little trees', bands: ['crosses', 'line', 'trees', 'peaks'] },
  { id: 'reindeer', label: 'Reindeer', bands: ['diamonds', 'reindeer', 'zigzag'] },
  { id: 'hearts', label: 'Hearts', bands: ['checks', 'hearts', 'checks', 'small-star'] },
  { id: 'none', label: 'Plain', bands: [] },
]

/** What the page's controls make. */
export interface KnitChoice {
  /** The sweater, an id of `KNIT_SWEATERS`. */
  sweater: string
  /** The pattern, an id of `KNIT_PATTERNS`. */
  pattern: string
  /** A stitch's width, in CSS pixels. */
  stitch: number
  /** Snow dots over the plain field. */
  snow: boolean
}
/** Where knitting's settings start. */
export const KNIT_START: KnitChoice = { sweater: 'red', pattern: 'nordic', stitch: 9, snow: true }

const sweaterOf = (id: string) => KNIT_SWEATERS.find((s) => s.id === id) ?? KNIT_SWEATERS[0]
/** The color to put behind the canvas before the knitting is drawn: the sweater's body. */
export const knitGround = (c: KnitChoice) => `rgb(${sweaterOf(c.sweater).yarns[0].map((v) => Math.round(v * 255)).join(' ')})`

/** The look for the stage; `steady` 0 decides every frame afresh (for a frame drawn only when asked for). */
export function knitLook(c: KnitChoice, steady?: number): KnitLook {
  return { size: c.stitch, yarns: sweaterOf(c.sweater).yarns, bands: (KNIT_PATTERNS.find((p) => p.id === c.pattern) ?? KNIT_PATTERNS[0]).bands, snow: c.snow, steady }
}
