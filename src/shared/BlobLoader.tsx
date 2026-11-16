/**
 * A small waiting mark: one blob that splits into three and comes back together.
 * Decoration only: the page says what it is waiting for in its own status line.
 * The pieces melt into each other through the `blob-loader-goo` filter (a blur, then a hard alpha cut).
 */
export function BlobLoader({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 64 28" className={`blob-loader ${className}`}>
      <defs>
        <filter id="blob-loader-goo" x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.6" result="soft" />
          <feColorMatrix in="soft" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" />
        </filter>
      </defs>
      <g filter="url(#blob-loader-goo)" fill="var(--color-blob)">
        <circle className="blob-loader-left" cx="32" cy="14" r="5.5" />
        <circle className="blob-loader-mid" cx="32" cy="14" r="6.5" />
        <circle className="blob-loader-right" cx="32" cy="14" r="5.5" />
      </g>
    </svg>
  )
}
