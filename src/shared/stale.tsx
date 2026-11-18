import { useSyncExternalStore } from 'react'

/**
 * A page that was opened before the site's last update asks for its lazy parts (a stage, a worker's
 * code, a page's data) by names the server no longer has, so the first thing picked after an update
 * fails to load while everything already loaded carries on. Vite says so with `vite:preloadError`;
 * the page then owns up to it and offers a reload, in place of blaming the browser.
 */
let stale = false
const listeners = new Set<() => void>()

/** Starts listening for parts of the site that are gone. Call once, before the app draws. */
export function watchStale() {
  window.addEventListener('vite:preloadError', () => {
    if (stale) return
    stale = true
    listeners.forEach((l) => l())
  })
}

/** Whether a part of the site failed to load since this page was opened. */
export function isStale() { return stale }

export const STALE = 'Blobscape was updated while this page was open, so this part could not load. Reload the page to carry on.'

/** What a view says when its stage did not start: `what` needs it, as in "which the forest needs". */
export function startFailure(what: string) {
  return stale ? STALE : `This browser could not start WebGPU or WebGL 2, which ${what}.`
}

function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } }

/** A notice along the bottom of the page, with a button to reload, once a part of the site has gone. */
export function StaleNotice() {
  const on = useSyncExternalStore(subscribe, isStale, () => false)
  if (!on) return null
  return (
    <div role="alert" data-testid="stale-notice" className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-2xl bg-paper px-4 py-3 text-sm text-ink shadow-lg ring-1 ring-rule">
      <p className="min-w-0 flex-1 basis-56">Blobscape was updated while this page was open. Reload to carry on.</p>
      <button type="button" onClick={() => window.location.reload()} className="cursor-pointer rounded-full bg-ink px-4 py-2 font-medium text-paper hover:opacity-90">Reload</button>
    </div>
  )
}
