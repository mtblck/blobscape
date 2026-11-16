import { useEffect, useState } from 'react'
import { href } from './routes.ts'
import { Crumbs, Dates, useFocusHeading } from './Shell.tsx'
import { EXPERIMENTS_INTRO, byPublished, type Experiment } from './site.ts'
import { Chip } from '../shared/ui.tsx'

/** Each experiment's cover picture (a 16:10 still from it), on this page and the front page. */
export function Cover({ e }: { e: Experiment }) {
  // the card's title names the link, so the picture stays out of the way of screen readers
  return <img src={e.cover} alt="" width={1200} height={750} loading="lazy" decoding="async" className="block aspect-[16/10] h-auto w-full rounded-xl object-cover ring-1 ring-rule" />
}

type Order = 'newest' | 'oldest'
const ORDER_KEY = 'blobscape-experiments-order'
const ORDERS: { id: Order; label: string }[] = [{ id: 'newest', label: 'Newest first' }, { id: 'oldest', label: 'Oldest first' }]

/** Every experiment, listed like posts: each with the day it was published, newest first unless you turn the list round. */
export function Experiments() {
  const h1 = useFocusHeading()
  // the page is prerendered newest first, so it starts that way and takes up a kept choice once it is running
  const [order, setOrder] = useState<Order>('newest')
  useEffect(() => {
    try { if (localStorage.getItem(ORDER_KEY) === 'oldest') setOrder('oldest') } catch { /* storage blocked: newest first */ }
  }, [])
  const choose = (o: Order) => {
    setOrder(o)
    try { if (o === 'newest') localStorage.removeItem(ORDER_KEY); else localStorage.setItem(ORDER_KEY, o) } catch { /* the choice just isn't kept */ }
  }
  return (
    <div>
      <Crumbs here="Experiments" />
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 pt-6 pb-8">
        <div className="max-w-3xl">
          <h1 ref={h1} tabIndex={-1} className="font-display text-5xl outline-none">Experiments</h1>
          <p className="mt-4 text-xl leading-relaxed text-ink-muted">{EXPERIMENTS_INTRO}</p>
        </div>
        <div role="group" aria-label="Order by the day published" className="flex gap-1.5">
          {ORDERS.map((o) => <Chip small key={o.id} active={order === o.id} onClick={() => choose(o.id)}>{o.label}</Chip>)}
        </div>
      </div>
      <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" data-testid="experiment-list">
        {byPublished(order).map((e) => (
          <li key={e.id} className="relative flex flex-col gap-4 rounded-2xl border border-rule bg-paper p-4 transition-colors hover:border-ink-faint">
            <Cover e={e} />
            <Dates e={e} />
            {/* the link covers the whole card, and its name is the title alone */}
            <a href={e.url} className="group -mt-2 font-display text-2xl text-ink no-underline after:absolute after:inset-0 after:rounded-2xl hover:text-accent">{e.title} →</a>
            <p className="flex-1 text-ink-muted">{e.body}</p>
            <p className="text-sm text-ink-faint">Needs {e.needs}. Runs in your browser; nothing is uploaded.</p>
          </li>
        ))}
      </ul>
      <p className="mt-10 text-ink-muted">
        New to splats? The <a href={href({ page: 'lessons' })} className="text-ink underline underline-offset-2 hover:text-accent">lessons</a> start with a single blob.
      </p>
    </div>
  )
}
