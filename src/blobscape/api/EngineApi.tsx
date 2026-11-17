import { useContext, useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { href } from '../routes.ts'
import { Crumbs, useFocusHeading } from '../Shell.tsx'
import { API_DATA_ID, API_PAGE, ApiContext, type Api, type ApiEntry } from './types.ts'

/** The reference the prerendered page carries, read once. */
function carried(): Api | undefined {
  if (typeof document === 'undefined') return
  const el = document.getElementById(API_DATA_ID)
  try { return el?.textContent ? (JSON.parse(el.textContent) as Api) : undefined } catch { return undefined }
}

/** Doc text: paragraphs split at blank lines, an indented paragraph as code, `backticks` as code. */
function Doc({ text, className }: { text: string; className?: string }) {
  if (!text) return null
  return (
    <div className={className}>
      {text.split(/\n\s*\n/).map((p, i) =>
        /^ {2,}/.test(p) ? (
          <pre key={i} tabIndex={0} className="overflow-x-auto rounded-lg bg-paper-sunk p-3 text-[0.8rem]"><code>{p.replace(/^ {2}/gm, '')}</code></pre>
        ) : (
          <p key={i}>{inline(p.replace(/\s*\n\s*/g, ' '))}</p>
        ),
      )}
    </div>
  )
}

function inline(s: string): ReactNode[] {
  return s.split(/(`[^`]+`)/).map((part, i) => (part.startsWith('`') && part.endsWith('`') && part.length > 2 ? <code key={i}>{part.slice(1, -1)}</code> : part))
}

const KIND: Record<ApiEntry['kind'], string> = { function: 'function', const: 'value', class: 'class', interface: 'interface', type: 'type', enum: 'enum' }

/**
 * The @blobscape/engine API reference (/engine/api/): every exported name, its declaration and its doc comment, one
 * section per module in the order the package's entry exports them. Prerendered from the app; the data rides in the
 * page as JSON so the bundle doesn't carry it, and in-app visits load it on their own.
 */
export function EngineApi() {
  const h1 = useFocusHeading()
  const fromServer = useContext(ApiContext)
  const [api, setApi] = useState<Api | undefined>(() => fromServer ?? carried())
  useEffect(() => {
    if (api) return
    let gone = false
    void import('../engineApi.json').then((m) => { if (!gone) setApi(m.default as Api) })
    return () => { gone = true }
  }, [api])
  const [find, setFind] = useState('')
  const findId = useId()
  const q = find.trim().toLowerCase()
  const shown = useMemo(() => api?.modules.map((m) => ({ ...m, entries: q ? m.entries.filter((e) => e.name.toLowerCase().includes(q) || e.doc.toLowerCase().includes(q) || e.code.toLowerCase().includes(q)) : m.entries })).filter((m) => m.entries.length) ?? [], [api, q])
  const total = api?.modules.reduce((n, m) => n + m.entries.length, 0) ?? 0
  const count = shown.reduce((n, m) => n + m.entries.length, 0)

  return (
    <article className="pb-8">
      <Crumbs here={API_PAGE.crumb} parent={{ label: 'Engine', href: href({ page: 'engine' }) }} />
      <header className="max-w-3xl pt-6">
        <h1 ref={h1} tabIndex={-1} className="font-display text-5xl outline-none">{API_PAGE.title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-muted">
          Every name <code>@blobscape/engine</code> exports, read from the package&rsquo;s own type declarations. Start with{' '}
          <a href="#stage-Stage" className="text-accent underline underline-offset-2">Stage</a>; the lessons in{' '}
          <a href={href({ page: 'lesson', id: 'first-creature' })} className="text-accent underline underline-offset-2">Build with the engine</a> walk through
          a creature, a scene written as data and pixel art with it. The package is version 0.x and isn&rsquo;t on npm yet.
        </p>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-12 lg:gap-x-8">
        <nav aria-label="Sections" className="lg:sticky lg:top-20 lg:col-span-3 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
          <label htmlFor={findId} className="text-sm text-ink-muted">Find a name</label>
          <input
            id={findId}
            type="search"
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder="setPixels, Swing…"
            className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <p role="status" className="mt-2 text-xs text-ink-faint" data-testid="api-count">{api ? (q ? `${count} of ${total} names` : `${total} names in ${api.modules.length} sections`) : 'Loading the reference…'}</p>
          <ol className="mt-3 space-y-1 text-sm">
            {shown.map((m) => (
              <li key={m.id}><a href={`#${m.id}`} className="text-ink-muted hover:text-accent">{m.title}</a></li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0 lg:col-span-9" data-testid="api">
          {shown.map((m) => (
            <section key={m.id} aria-labelledby={m.id} className="border-t border-rule pt-6 pb-4 first:border-t-0 first:pt-0">
              <h2 id={m.id} className="scroll-mt-20 font-display text-3xl">{m.title}</h2>
              <Doc text={m.doc} className="mt-2 max-w-[42em] space-y-2 leading-relaxed text-ink-muted" />
              {m.entries.map((e) => (
                <div key={e.name} className="mt-6">
                  <h3 id={`${m.id}-${e.name}`} className="flex scroll-mt-20 items-baseline gap-2">
                    <code className="text-lg font-semibold text-ink">{e.name}</code>
                    <span className="text-xs text-ink-faint">{KIND[e.kind]}</span>
                  </h3>
                  <Doc text={e.doc} className="mt-1 max-w-[42em] space-y-2 text-sm leading-relaxed text-ink-muted" />
                  <pre tabIndex={0} aria-label={`${e.name}, as declared`} className="mt-2 max-h-[28rem] overflow-auto rounded-lg border border-rule bg-paper-sunk p-3 text-[0.78rem] leading-relaxed text-ink"><code>{e.code}</code></pre>
                </div>
              ))}
            </section>
          ))}
          {api && !shown.length && <p className="text-ink-muted">No name, description or declaration has &ldquo;{find}&rdquo; in it.</p>}
        </div>
      </div>
    </article>
  )
}
