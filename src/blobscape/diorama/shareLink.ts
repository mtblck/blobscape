/**
 * A link to the page as the visitor has set it up (Matt, 2026-11-21: a Share button beside Export the loop, with the
 * address holding every setting changed), and the three places it can be shared to. Pure: the page hands in its
 * current settings and the address it is on.
 */

/** A settings object of plain fields, as every look's choice is (`CelChoice`, `BlockChoice`, `GlitchChoice` …). */
export type Plain<T> = { [K in keyof T]: number | string | boolean | null }

/** One address setting: a value, or undefined to leave it out. */
export type Entry = readonly [key: string, value: string | undefined]

/** A number as short as it can be written and still read back the same to four significant figures. */
export const short = (v: number) => String(Number(v.toPrecision(4)))

const write = (v: number | string | boolean | null) => (v === null ? undefined : typeof v === 'boolean' ? (v ? '1' : '0') : typeof v === 'number' ? short(v) : v)

/**
 * The fields of `now` that differ from `start`, as `prefix.field` entries; the fields that don't are left out
 * (undefined), so a link drops a setting the visitor has put back.
 */
export function choiceEntries<T extends Plain<T>>(prefix: string, now: T, start: T): Entry[] {
  const a = now as Record<string, number | string | boolean | null>, b = start as Record<string, number | string | boolean | null>
  return Object.keys(b).map((k) => {
    const v = a[k], w = b[k], same = typeof v === 'number' && typeof w === 'number' ? short(v) === short(w) : v === w
    return [`${prefix}.${k}`, same || v === undefined ? undefined : write(v)] as const
  })
}

/**
 * The fields the address gives for `prefix`, read as the type `start` has for each: numbers must be finite, a switch is
 * `1` or `0`, a word must not be empty. Anything else is left at what it was, so a mistyped link still opens.
 */
export function choiceFrom<T extends Plain<T>>(prefix: string, start: T, q: URLSearchParams): Partial<T> {
  const out: Record<string, number | string | boolean> = {}
  for (const k of Object.keys(start)) {
    const s = q.get(`${prefix}.${k}`)
    if (s === null) continue
    const was = (start as Record<string, unknown>)[k], kind = typeof was
    // a field that starts as null ("the look's own way") takes a switch
    if (was === null) { if (s === '1' || s === '0') out[k] = s === '1' }
    else if (kind === 'number') { const n = Number(s); if (s.trim() !== '' && Number.isFinite(n)) out[k] = n }
    else if (kind === 'boolean') { if (s === '1' || s === '0') out[k] = s === '1' }
    else if (s !== '') out[k] = s
  }
  return out as Partial<T>
}

/** `href` with each entry set or, where undefined, taken out; anything after `#` is dropped. Commas stay commas, which read better in a view. */
export function linkWith(href: string, entries: readonly Entry[]): string {
  const url = new URL(href)
  url.hash = ''
  for (const [k, v] of entries) { if (v === undefined) url.searchParams.delete(k); else url.searchParams.set(k, v) }
  return url.toString().replace(/%2C/gi, ',')
}

/** A view as the address holds it: azimuth, elevation, distance, then the point it looks at. */
export interface ViewOrbit { target: readonly [number, number, number]; distance: number; azimuth: number; elevation: number }
export const orbitText = (o: ViewOrbit) => [o.azimuth, o.elevation, o.distance, ...o.target].map(short).join(',')
export function orbitFrom(s: string | null): ViewOrbit | undefined {
  if (!s) return undefined
  const v = s.split(',').map(Number)
  if (v.length !== 6 || !v.every(Number.isFinite) || !(v[2] > 0)) return undefined
  return { azimuth: v[0], elevation: Math.max(-89, Math.min(89, v[1])), distance: v[2], target: [v[3], v[4], v[5]] }
}

/** Where a link can be shared, each its own site's page for sharing a link (nothing is sent until the visitor posts it there). */
export const SHARE_SITES: { id: 'facebook' | 'x' | 'reddit'; label: string; url: (link: string, title: string) => string }[] = [
  { id: 'facebook', label: 'Facebook', url: (link) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}` },
  { id: 'x', label: 'X', url: (link, title) => `https://x.com/intent/tweet?url=${encodeURIComponent(link)}&text=${encodeURIComponent(title)}` },
  { id: 'reddit', label: 'Reddit', url: (link, title) => `https://www.reddit.com/submit?url=${encodeURIComponent(link)}&title=${encodeURIComponent(title)}` },
]
