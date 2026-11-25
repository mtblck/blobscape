import { useEffect, useRef, useState } from 'react'
import { Button } from '../../shared/ui.tsx'
import { SHARE_SITES } from './shareLink.ts'

/**
 * Share the scene as it is set up: its link, with every setting changed in the address, to copy or to post on
 * Facebook, X or Reddit. A native modal dialog, as Scene details is, so focus stays inside, Escape closes it and focus
 * goes back to the button that opened it. Each site's own sharing page opens in a new tab; nothing is sent from here.
 */
export function ShareDialog({ link, title, note, onClose }: { link: string | undefined; title: string; note?: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const field = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState('')
  const open = link !== undefined
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) { setCopied(''); d.showModal() }
    if (!open && d.open) d.close()
  }, [open])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link ?? '')
      setCopied('Link copied.')
    } catch {
      // no clipboard (an older browser, or permission refused): the link is selected to copy by hand
      field.current?.select()
      setCopied('Press Ctrl+C or ⌘C to copy the selected link.')
    }
  }
  return (
    <dialog
      ref={ref}
      aria-labelledby="share-title"
      data-testid="diorama-share"
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
      className="m-auto w-[min(100%-1.5rem,32rem)] rounded-2xl border border-rule bg-paper p-0 text-ink shadow-2xl backdrop:bg-black/60"
    >
      <div className="grid gap-4 p-4 sm:p-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 id="share-title" className="font-display text-2xl leading-tight">Share this scene</h2>
            <p className="mt-1 text-sm text-ink-muted">The link opens the scene with your settings: style, time, weather, finish and view.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close sharing" className="grid size-9 flex-none cursor-pointer place-items-center rounded-full border border-rule text-ink hover:bg-paper-sunk">
            <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <div className="grid gap-2">
          <label htmlFor="share-link" className="text-sm font-medium">Link</label>
          <div className="flex gap-2">
            <input
              ref={field}
              id="share-link"
              readOnly
              value={link ?? ''}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded border border-rule bg-paper-sunk px-2 py-1.5 font-mono text-xs text-ink"
              data-testid="diorama-share-link"
            />
            <Button small primary onClick={copy} data-testid="diorama-share-copy">Copy link</Button>
          </div>
          <p role="status" className="text-xs text-ink-faint empty:hidden">{copied}</p>
          {note && <p className="text-xs text-ink-faint">{note}</p>}
        </div>
        <div className="grid gap-2">
          <p className="text-sm font-medium">Share to</p>
          <div className="flex flex-wrap gap-2">
            {SHARE_SITES.map((s) => (
              <a
                key={s.id}
                href={link ? s.url(link, title) : undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-rule px-3 py-1.5 text-sm transition-colors hover:border-ink-faint hover:bg-paper-sunk"
              >
                {s.label}<span className="sr-only"> (opens in a new tab)</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </dialog>
  )
}
