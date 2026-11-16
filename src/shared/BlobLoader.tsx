/**
 * The waiting mark: three soft blobs that slide together into one and apart again.
 * Decoration only: the page says what it is waiting for in its own status line.
 *
 * Each blob is its own element moved only by `transform` (keyframes in theme.css), so the browser
 * animates it off the main thread: cutting a scene keeps that thread busy for the whole wait, and
 * anything animated on it (an SVG's inner shapes, a filter) would stand still. It rests apart, so a
 * mark that cannot move still reads as three blobs.
 */
export function BlobLoader({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden className={`blob-loader ${className}`}>
      <span className="blob-loader-left" />
      <span className="blob-loader-mid" />
      <span className="blob-loader-right" />
    </span>
  )
}

/** The mark in the middle of an experiment's view, on a small pad so it shows over any scene. */
export function LoadingMark({ testid }: { testid: string }) {
  return (
    <div aria-hidden data-testid={testid} className="pointer-events-none absolute inset-0 grid place-items-center">
      <div className="rounded-full bg-paper/70 px-4 py-3 backdrop-blur-sm">
        <BlobLoader />
      </div>
    </div>
  )
}
