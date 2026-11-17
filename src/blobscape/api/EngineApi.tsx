import { memo, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import readme from '../../../packages/engine/README.md?raw'
import pkg from '../../../packages/engine/package.json'
import { Button } from '../../shared/ui.tsx'
import { href, LESSONS, PARTS } from '../routes.ts'
import { Crumbs, useFocusHeading } from '../Shell.tsx'
import { guideSections } from './guide.ts'
import { API_DATA_ID, API_PAGE, ApiContext, sectionId, type Api, type ApiEntry, type ApiMethod, type ApiProp, type ApiSignature } from './types.ts'
import { hashId, useActiveEntry } from './useActiveEntry.ts'

const REPO = 'https://github.com/mtblck/blobscape'
const INSTALL = 'npm install @blobscape/engine three'
const GUIDE = guideSections(readme)
const GUIDE_ID = 'getting-started'
/** The lessons that teach the package, as its longer guides. */
const GUIDE_LESSONS = LESSONS.slice(PARTS[PARTS.length - 1].from)
const LINK = 'text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent'
const LABEL = 'mt-5 mb-1 text-xs font-bold tracking-[0.08em] text-ink-faint uppercase'
const MONO = 'font-mono text-[0.875em]'

/** The reference the prerendered page carries, read once. */
function carried(): Api | undefined {
  if (typeof document === 'undefined') return
  const el = document.getElementById(API_DATA_ID)
  try { return el?.textContent ? (JSON.parse(el.textContent) as Api) : undefined } catch { return undefined }
}

/** Every name the page documents and the kind it is, so types and comments can link to them. */
type Names = Map<string, ApiEntry['kind']>
const shownAs = (name: string, names: Names) => (names.get(name) === 'function' ? `${name}()` : name)

/** A type as TypeDoc writes it, with every other name this page documents linked to its entry. */
function Type({ children, self, names }: { children: string; self?: string; names: Names }) {
  return (
    <code translate="no" className={`${MONO} text-ink-muted [overflow-wrap:anywhere]`}>
      {children.split(/\b([A-Za-z_$][\w$]*)\b/).map((piece, i) => (i % 2 === 1 && piece !== self && names.has(piece) ? <a key={i} href={`#${piece}`} className={LINK}>{piece}</a> : piece))}
    </code>
  )
}

/** Doc text: paragraphs split at blank lines, an indented paragraph as code, lines that start with a dash as a list, `backticks` as code, linked where they name an export. */
function Doc({ text, names, className }: { text: string; names: Names; className?: string }) {
  if (!text) return null
  return (
    <div className={className}>
      {text.split(/\n\s*\n/).map((p, i) =>
        /^ {2,}/.test(p) ? (
          <pre key={i} tabIndex={0} className="overflow-x-auto rounded-lg bg-paper-sunk p-3 font-mono text-[0.8rem] text-ink"><code>{p.replace(/^ {2}/gm, '')}</code></pre>
        ) : /^- /.test(p) ? (
          <ul key={i} className="list-disc space-y-1 pl-5">{p.split(/\n(?=- )/).map((li, j) => <li key={j}>{inline(li.slice(2).replace(/\s*\n\s*/g, ' '), names)}</li>)}</ul>
        ) : (
          <p key={i}>{inline(p.replace(/\s*\n\s*/g, ' '), names)}</p>
        ),
      )}
    </div>
  )
}

function inline(s: string, names: Names): ReactNode[] {
  return s.split(/(`[^`]+`)/).map((part, i) => {
    if (!(part.startsWith('`') && part.endsWith('`') && part.length > 2)) return part
    const code = part.slice(1, -1)
    const name = code.replace(/\(\)$/, '')
    return names.has(name) ? <a key={i} href={`#${name}`} className={LINK}><code className={MONO}>{shownAs(name, names)}</code></a> : <code key={i} className={`${MONO} text-ink`}>{code}</code>
  })
}

const Tag = ({ children }: { children: string }) => <span className="rounded-full border border-rule px-2 text-xs text-ink-faint">{children}</span>

function Signatures({ list, label, self, names }: { list: ApiSignature[]; label: string; self?: string; names: Names }) {
  return (
    <>
      {list.map((s, i) => (
        <div key={i}>
          <pre tabIndex={0} aria-label={label} className="mt-3 overflow-x-auto rounded-lg bg-paper-sunk px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap"><Type self={self} names={names}>{s.code}</Type></pre>
          {s.params && (
            <>
              <h4 className={LABEL}>Parameters</h4>
              <Props list={s.params} names={names} />
            </>
          )}
          {s.returns && (
            <>
              <h4 className={LABEL}>Returns</h4>
              <div className="text-ink-muted"><Type names={names}>{s.returns.type}</Type> <Doc text={s.returns.doc} names={names} className="inline [&>p]:inline" /></div>
            </>
          )}
        </div>
      ))}
    </>
  )
}

/** Each property: its name and type on one line, the words under it. */
function Props({ list, names, owner }: { list: ApiProp[]; names: Names; owner?: string }) {
  return (
    <dl>
      {list.map((p) => (
        <div key={p.name} id={owner && `${owner}.${p.name}`} className="scroll-mt-20 border-t border-rule-soft py-3 first:border-t-0">
          <dt className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <code translate="no" className={`${MONO} font-bold text-ink`}>{p.name}</code>
            <Type names={names}>{p.type}</Type>
            {p.static && <Tag>static</Tag>}
            {p.readonly && <Tag>read only</Tag>}
            {p.optional && <Tag>optional</Tag>}
          </dt>
          {p.doc && <dd className="mt-1 max-w-[64ch] text-ink-muted"><Doc text={p.doc} names={names} className="space-y-2" /></dd>}
        </div>
      ))}
    </dl>
  )
}

function Methods({ list, names, owner }: { list: ApiMethod[]; names: Names; owner: string }) {
  return (
    <dl>
      {list.map((m) => (
        <div key={m.name} id={`${owner}.${m.name}`} className="scroll-mt-20 border-t border-rule-soft py-3 first:border-t-0">
          <dt className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <code translate="no" className={`${MONO} font-bold text-ink`}>{m.name}()</code>
            {m.static && <Tag>static</Tag>}
            {m.optional && <Tag>optional</Tag>}
          </dt>
          <dd>
            {m.doc && <Doc text={m.doc} names={names} className="mt-1 max-w-[64ch] space-y-2 text-ink-muted" />}
            <Signatures list={m.signatures} label={`Signature of ${m.name}`} names={names} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

const KIND: Record<ApiEntry['kind'], string> = { function: 'function', const: 'value', class: 'class', interface: 'interface', type: 'type', enum: 'enum', alias: 'another name' }

/** One export's card: its name, what it does, and its shape. */
const Entry = memo(function Entry({ e, active, names }: { e: ApiEntry; active: boolean; names: Names }) {
  return (
    <article id={e.name} aria-labelledby={`${e.name}-name`} className={`mt-4 scroll-mt-20 rounded-2xl border bg-paper px-4 pt-5 pb-6 transition-[border-color,box-shadow] duration-200 sm:px-7 ${active ? 'border-accent shadow-[0_0_0_3px_color-mix(in_srgb,var(--c-accent)_22%,transparent)]' : 'border-rule'}`}>
      <h3 id={`${e.name}-name`} className="flex flex-wrap items-baseline gap-x-2.5">
        <code translate="no" className="font-mono text-xl font-bold text-ink">{shownAs(e.name, names)}{e.generics}</code>
        <span className="text-xs text-ink-faint">{KIND[e.kind]}</span>
      </h3>
      <Doc text={e.doc} names={names} className="mt-2 max-w-[64ch] space-y-2 text-ink-muted" />
      {e.of && <p className="mt-2 text-ink-muted">Another name for <a href={`#${e.of}`} className={LINK}><code className={MONO}>{e.of}</code></a>.</p>}
      {e.signatures && <Signatures list={e.signatures} label={`Signature of ${e.name}`} self={e.name} names={names} />}
      {e.type !== undefined && <pre tabIndex={0} aria-label={`Type of ${e.name}`} className="mt-3 max-h-[28rem] overflow-auto rounded-lg bg-paper-sunk px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap"><Type self={e.name} names={names}>{e.type}</Type></pre>}
      {e.extends && <p className="mt-3 text-ink-muted">Plus everything in {e.extends.map((x, i) => <span key={x}>{i > 0 && ', '}<Type names={names}>{x}</Type></span>)}.</p>}
      {e.ctor && (
        <>
          <h4 className={LABEL}>Constructor</h4>
          <Signatures list={e.ctor} label={`Constructor of ${e.name}`} self={e.name} names={names} />
        </>
      )}
      {e.props && (
        <>
          <h4 className={LABEL}>{e.kind === 'enum' ? 'Members' : 'Properties'}</h4>
          <Props list={e.props} names={names} owner={e.name} />
        </>
      )}
      {e.methods && (
        <>
          <h4 className={LABEL}>Methods</h4>
          <Methods list={e.methods} names={names} owner={e.name} />
        </>
      )}
    </article>
  )
})

/** Does an export have the words being looked for, anywhere in what the page shows of it? */
function has(e: ApiEntry, q: string): boolean {
  const sigs = (list?: ApiSignature[]) => list?.some((s) => s.code.toLowerCase().includes(q))
  return e.name.toLowerCase().includes(q) || e.doc.toLowerCase().includes(q) || !!e.type?.toLowerCase().includes(q) || !!sigs(e.signatures) || !!sigs(e.ctor)
    || !!e.props?.some((p) => p.name.toLowerCase().includes(q) || p.doc.toLowerCase().includes(q))
    || !!e.methods?.some((m) => m.name.toLowerCase().includes(q) || m.doc.toLowerCase().includes(q) || sigs(m.signatures))
}

function CopyInstall() {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { setCopied(false) }
  }
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <code translate="no" className="rounded-lg border border-rule bg-paper-sunk px-3 py-2 font-mono text-sm text-ink">{INSTALL}</code>
      <Button small className="rounded-full px-4" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</Button>
      <p aria-live="polite" className="sr-only">{copied ? 'Copied the install command.' : ''}</p>
    </div>
  )
}

/**
 * The @blobscape/engine docs (/engine/docs/), laid out like the tipjar docs: an intro with the install line, a
 * contents list that sticks beside the page on wide screens and follows what is being read, the package README as
 * the getting-started guide, then one card per export, grouped by module in the order the package's entry exports
 * them. The reference is read with TypeDoc (tools/api-docs). Prerendered from the app; the data rides in the page as
 * JSON so the bundle doesn't carry it, and in-app visits load it on their own.
 */
export function EngineApi() {
  const h1 = useFocusHeading()
  const fromServer = useContext(ApiContext)
  const [api, setApi] = useState<Api | undefined>(() => fromServer ?? carried())
  useEffect(() => {
    if (api) return
    let gone = false
    void import('../engineApi.json').then((m) => {
      if (gone) return
      setApi(m.default as Api)
      // the entries arrive after the page: go to the one the address names once they're in
      requestAnimationFrame(() => { const id = hashId(); if (id) document.getElementById(id)?.scrollIntoView() })
    })
    return () => { gone = true }
  }, [api])

  const [find, setFind] = useState('')
  const findId = useId()
  const q = find.trim().toLowerCase()
  const names = useMemo<Names>(() => new Map(api?.modules.flatMap((m) => m.entries.map((e) => [e.name, e.kind] as const)) ?? []), [api])
  const shown = useMemo(() => api?.modules.map((m) => ({ ...m, entries: q ? m.entries.filter((e) => has(e, q)) : m.entries })).filter((m) => m.entries.length) ?? [], [api, q])
  const total = api?.modules.reduce((n, m) => n + m.entries.length, 0) ?? 0
  const count = shown.reduce((n, m) => n + m.entries.length, 0)
  const ids = useMemo(() => [...(q ? [] : GUIDE.map((g) => g.id)), ...shown.flatMap((m) => m.entries.map((e) => e.name))], [shown, q])
  const [active, choose] = useActiveEntry(ids)

  // On a wide screen the contents scroll on their own when taller than the window: keep the current link in view.
  const toc = useRef<HTMLElement>(null)
  useEffect(() => {
    const box = toc.current
    const link = box?.querySelector<HTMLElement>('[aria-current]')
    if (!box || !link || box.scrollHeight <= box.clientHeight) return
    const top = link.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
    if (top < box.scrollTop || top + link.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top - box.clientHeight / 2
  }, [active])

  const head = 'font-semibold text-ink hover:text-accent'
  const item = (id: string, label: ReactNode) => (
    <li key={id}>
      <a href={`#${id}`} aria-current={active === id ? 'location' : undefined} onClick={() => choose(id)} className={`-ml-0.5 block border-l-2 py-0.5 pl-3 transition-colors hover:text-ink hover:underline ${active === id ? 'border-accent font-semibold text-ink' : 'border-transparent text-ink-muted'}`}>{label}</a>
    </li>
  )
  // a group's names show while one of them is being read, or while looking for one; on a phone only while looking
  const list = (open: boolean, children: ReactNode) => open && <ul className={`mt-1.5 border-l-2 border-rule-soft ${q ? '' : 'hidden lg:block'}`}>{children}</ul>

  return (
    <article className="pb-8">
      <Crumbs here={API_PAGE.crumb} parent={{ label: 'Engine', href: href({ page: 'engine' }) }} />
      <header className="max-w-[44rem] pt-6 pb-2">
        <p className="font-display text-xl text-accent"><span translate="no">{pkg.name}</span> {pkg.version}</p>
        <h1 ref={h1} tabIndex={-1} className="mt-1 font-display text-5xl outline-none sm:text-6xl">{API_PAGE.title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-muted">
          How to start with the engine, and everything it exports. The reference is generated with TypeDoc from the doc comments in the package itself, so it can&rsquo;t drift from the code. Start with{' '}
          <a href="#Stage" className={LINK}>Stage</a>; for a longer walk through, take the{' '}
          <a href={href({ page: 'lesson', id: GUIDE_LESSONS[0].id })} className={LINK}>Build with the engine</a> lessons. It is version 0.x, so the API will change between minor versions.
        </p>
        <CopyInstall />
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-12">
        <nav ref={toc} aria-label="On this page" className="rounded-xl border border-rule px-5 py-4 text-sm lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:rounded-none lg:border-0 lg:p-0 lg:pr-2">
          <label htmlFor={findId} className="text-ink-muted">Find a name</label>
          <input
            id={findId}
            type="search"
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder="setPixels, Swing…"
            className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <p role="status" className="mt-2 text-xs text-ink-faint" data-testid="api-count">{api ? (q ? `${count} of ${total} names` : `${total} names in ${api.modules.length} sections`) : 'Loading the reference…'}</p>
          <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-x-6 gap-y-2.5 lg:grid-cols-1">
            {!q && (
              <div>
                <a href={`#${GUIDE_ID}`} className={head}>Getting started</a>
                {list(GUIDE.some((g) => g.id === active), GUIDE.map((g) => item(g.id, g.title)))}
              </div>
            )}
            {shown.map((m) => (
              <div key={m.id}>
                <a href={`#${sectionId(m.id)}`} className={head}>{m.title.split(':')[0]}</a>
                {list(!!q || m.entries.some((e) => e.name === active), m.entries.map((e) => item(e.name, <code translate="no" className="font-mono text-[0.8125rem]">{shownAs(e.name, names)}</code>)))}
              </div>
            ))}
          </div>
        </nav>

        <div className="min-w-0" data-testid="api">
          {!q && (
            <section aria-labelledby={GUIDE_ID} data-testid="api-guide">
              <h2 id={GUIDE_ID} className="scroll-mt-20 font-display text-4xl">Getting started</h2>
              {GUIDE.map((g) => (
                <section key={g.id} aria-labelledby={g.id} className="mt-8">
                  <h3 id={g.id} className="scroll-mt-20 font-display text-2xl">{g.title}</h3>
                  <div className="spec docs-guide max-w-[46rem]" dangerouslySetInnerHTML={{ __html: g.html }} />
                </section>
              ))}
              <section aria-labelledby="guides" className="mt-8">
                <h3 id="guides" className="scroll-mt-20 font-display text-2xl">Longer guides</h3>
                <ul className="mt-3 max-w-[46rem] list-disc space-y-2 pl-5 leading-relaxed text-ink-muted">
                  {GUIDE_LESSONS.map((l) => (
                    <li key={l.id}><a href={href({ page: 'lesson', id: l.id })} className={LINK}>{l.title}</a>: a lesson you play with, ending in the code for what you made.</li>
                  ))}
                  <li><a href={`${REPO}/blob/main/docs/scene-descriptions.md`} className={LINK}>Writing a scene description</a>: every shape, paint and move a scene written as data can use.</li>
                  <li><a href={href({ page: 'spec' })} className={LINK}>Rigged Gaussian splats in glTF</a>: the rule the .glb files follow.</li>
                </ul>
              </section>
            </section>
          )}
          {shown.map((m) => (
            <section key={m.id} aria-labelledby={sectionId(m.id)} className={q ? 'mt-10 first:mt-0' : 'mt-14'}>
              <h2 id={sectionId(m.id)} className="scroll-mt-20 font-display text-4xl">{m.title}</h2>
              <Doc text={m.doc} names={names} className="mt-3 max-w-[64ch] space-y-2 leading-relaxed text-ink-muted" />
              {m.entries.map((e) => <Entry key={e.name} e={e} active={active === e.name} names={names} />)}
            </section>
          ))}
          {api && !shown.length && <p className="text-ink-muted">No name, description or type has &ldquo;{find}&rdquo; in it.</p>}
        </div>
      </div>
    </article>
  )
}
