import { useState } from 'react'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { CONTACT_INTRO, SITE } from './site.ts'
import { LIMITS, checkContact } from './contact.ts'

const INPUT = 'w-full rounded-lg border border-rule bg-paper px-3 py-2.5 text-ink placeholder:text-ink-faint transition-colors hover:border-ink-faint focus:border-accent'
const LABEL = 'text-sm font-semibold text-ink'

type State = { is: 'idle' } | { is: 'sending' } | { is: 'sent' } | { is: 'failed'; why: string }

/** Get in touch: a short form that the site's /api/contact function emails on (api/contact.ts). */
export function Contact() {
  const h1 = useFocusHeading()
  const [state, setState] = useState<State>({ is: 'idle' })
  const [message, setMessage] = useState('')

  const send = async (form: HTMLFormElement) => {
    const data = Object.fromEntries(new FormData(form)) as Record<string, string>
    const checked = checkContact(data)
    if (!checked.ok) return setState({ is: 'failed', why: checked.error })
    setState({ is: 'sending' })
    try {
      const r = await fetch('/api/contact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
      if (r.ok) {
        form.reset()
        setMessage('')
        return setState({ is: 'sent' })
      }
      const why = r.status === 429 ? 'That’s a lot of notes at once. Try again in a minute.'
        : r.status === 400 ? ((await r.json().catch(() => null))?.error ?? 'Something in the form isn’t right.')
        : 'It didn’t send, and that’s on our side. Try again in a little while.'
      setState({ is: 'failed', why })
    } catch {
      setState({ is: 'failed', why: 'It couldn’t reach the site. Check your connection and try again.' })
    }
  }

  return (
    <div className="max-w-2xl">
      <Crumbs here="Get in touch" />
      <div className="pt-6 pb-8">
        <h1 ref={h1} tabIndex={-1} className="font-display text-5xl outline-none">Get in touch</h1>
        <p className="mt-4 text-xl leading-relaxed text-ink-muted">{CONTACT_INTRO}</p>
      </div>

      {state.is === 'sent' ? (
        <div role="status" className="rounded-2xl border border-done bg-paper-sunk p-6">
          <p className="font-display text-2xl">Thanks, it’s on its way.</p>
          <p className="mt-2 text-ink-muted">If you left an email address, I’ll reply there.</p>
          <button type="button" onClick={() => setState({ is: 'idle' })} className="mt-4 cursor-pointer text-accent underline underline-offset-2 hover:text-accent-ink hover:no-underline">Send another note</button>
        </div>
      ) : (
        <form
          noValidate
          onSubmit={(e) => { e.preventDefault(); void send(e.currentTarget) }}
          className="flex flex-col gap-5 rounded-2xl border border-rule bg-paper-sunk/60 p-5 sm:p-6"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>Name <span className="font-normal text-ink-faint">(optional)</span></span>
              <input name="name" autoComplete="name" maxLength={LIMITS.name} className={INPUT} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>Email <span className="font-normal text-ink-faint">(if you’d like a reply)</span></span>
              <input name="email" type="email" autoComplete="email" inputMode="email" maxLength={LIMITS.email} className={INPUT} />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Message</span>
            <textarea
              name="message"
              required
              rows={6}
              maxLength={LIMITS.message}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              aria-describedby="message-count"
              className={`${INPUT} min-h-36 resize-y`}
            />
            <span id="message-count" className="self-end text-xs text-ink-faint tabular-nums">{message.length} of {LIMITS.message}</span>
          </label>
          {/* Hidden from people; a bot that fills every field fills this one too */}
          <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label>Website <input name="website" tabIndex={-1} autoComplete="off" /></label>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <button
              type="submit"
              disabled={state.is === 'sending'}
              className="inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-accent px-5 font-medium text-paper transition-colors hover:bg-accent-ink disabled:cursor-wait disabled:opacity-60"
            >
              {state.is === 'sending' ? 'Sending…' : 'Send'}
            </button>
            <p role="status" className="text-sm text-accent empty:hidden">{state.is === 'failed' ? state.why : ''}</p>
          </div>
          <p className="text-sm text-ink-faint">
            Your note is emailed to {SITE.author.name} and not kept anywhere else. Your address is only used to reply.
          </p>
        </form>
      )}
    </div>
  )
}
