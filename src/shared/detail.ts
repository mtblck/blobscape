/**
 * The Detail choice in the address (`?detail=`), the same on every experiment (Matt asked, 2026-11-19): a link
 * can open a page at a chosen detail. A choice goes by its label in small letters ("fine", "lush") or its id,
 * and a blob count by "200k" or "200000". A page reads it once as it starts and writes it when the visitor
 * picks one; a detail the page chose for the device is never written, or a link from a phone would hold a
 * desktop to the phone's detail.
 */

/** The names a blob count goes by in the address. */
export const countNames = (n: number): string[] => [`${n / 1000}k`, String(n)]

/** The names a choice with an id and a label goes by. */
export const labelNames = (o: { id: string | number; label: string }): string[] => [o.label.toLowerCase(), String(o.id).toLowerCase()]

/** Which of a page's choices a `?detail=` value names, if any. */
export function detailNamed<T>(options: readonly T[], names: (o: T) => readonly string[], asked: string | null | undefined): T | undefined {
  const want = asked?.trim().toLowerCase()
  if (!want) return undefined
  return options.find((o) => names(o).includes(want))
}

/** A blob count the address asks for ("60k", "60000"), for pages whose levels differ from one subject to the next. */
export function countAsked(asked: string | null | undefined): number | undefined {
  const m = /^(\d+(?:\.\d+)?)(k?)$/.exec(asked?.trim().toLowerCase() ?? '')
  if (!m) return undefined
  const n = Number(m[1]) * (m[2] ? 1000 : 1)
  return n > 0 ? n : undefined
}

/** The address's own `?detail=`, or nothing where there is no address (on the server). */
export const detailInAddress = (): string | null => (typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('detail'))

/** Which choice this page's address names. */
export const detailAsked = <T,>(options: readonly T[], names: (o: T) => readonly string[]): T | undefined => detailNamed(options, names, detailInAddress())

/** Puts the visitor's choice in the address, by the first of its names. */
export function writeDetail(name: string) {
  if (typeof location === 'undefined') return
  const url = new URL(location.href)
  url.searchParams.set('detail', name)
  history.replaceState(history.state, '', url)
}
