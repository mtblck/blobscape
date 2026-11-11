/*
 * Blobscape's logo, from the brand kit (svg/horizontal.svg and svg/mark.svg):
 * a Gaussian bell with eyes on its axis, then the wordmark. The axis and the
 * wordmark take --c-logo-ink (Deep on light, Paper on dark), so one inline
 * SVG covers both themes. Don't recolour the blob, stretch or add effects.
 */

import { AXIS, BLOB, WORD } from './logoPaths.ts'

/** The full logo, mark and wordmark. Keep it at least 120px wide; below that use the mark. */
export function Logo({ className, title = 'Blobscape' }: { className?: string; title?: string | null }) {
  return (
    <svg viewBox="0 0 1155.48 187.2" className={className} role={title ? 'img' : undefined} aria-label={title ?? undefined} aria-hidden={title ? undefined : true}>
      <g transform="translate(-4 -80)">
        <path d={BLOB} fill="#f2553a" fillRule="evenodd" />
        <path d={AXIS} fill="var(--c-logo-ink)" />
      </g>
      <path d={WORD} fill="var(--c-logo-ink)" />
    </svg>
  )
}

/** The mark alone, for small or square spaces (at least 24px wide). */
export function Mark({ className, title = null }: { className?: string; title?: string | null }) {
  return (
    <svg viewBox="0 0 248 144" className={className} role={title ? 'img' : undefined} aria-label={title ?? undefined} aria-hidden={title ? undefined : true}>
      <g transform="translate(-4 -80)">
        <path d={BLOB} fill="#f2553a" fillRule="evenodd" />
        <path d={AXIS} fill="var(--c-logo-ink)" />
      </g>
    </svg>
  )
}
