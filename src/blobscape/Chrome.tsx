import { useEffect, useMemo, useRef } from 'react'
import { tipjar, tuck } from 'tipjar'
import 'tipjar/style.css'
import { type Route } from './routes.ts'
import { SITE } from './site.ts'
import { pageMeta } from './meta.ts'

/**
 * The floating support button, on every page (Matt, 2026-11-17; it was once kept off pages with controls). It opens
 * a short list of ways to support: a coffee on Ko-fi and a star on GitHub (tipjar's `links`: the browser's own
 * popover, so no script). Where a page is for reading it is the whole button; on a page with controls (`small`) it
 * is a circle that opens on hover, so it covers as little as it can. On a phone it is a circle everywhere. It tucks
 * away once the footer, which has its own support link, scrolls into view.
 */
export function TipButton({ small = false }: { small?: boolean }) {
  const holder = useRef<HTMLElement>(null)
  // tipjar() escapes everything it is given and only allows http(s) links, so its markup is safe to insert
  const html = useMemo(() => tipjar({
    description: SITE.name,
    icon: 'heart',
    newTab: true,
    enter: 'fade',
    compact: small ? 'hover' : 'auto',
    menuId: 'support-menu',
    links: [
      { href: SITE.tip, label: 'Buy me a coffee', icon: 'coffee', description: 'on Ko-fi' },
      { href: SITE.repo, label: 'Star on GitHub', icon: 'star' },
    ],
  }), [small])
  useEffect(() => {
    const button = holder.current?.querySelector('.tipjar')
    return button instanceof HTMLElement ? tuck(button, 'footer') : undefined
  }, [html])
  return <aside ref={holder} aria-label="Support Blobscape" dangerouslySetInnerHTML={{ __html: html }} />
}

/** Keeps the title, description and canonical link in step as the app moves between pages. */
export function usePageMeta(route: Route) {
  useEffect(() => {
    const meta = pageMeta(route)
    document.title = meta.title
    document.querySelector('meta[name="description"]')?.setAttribute('content', meta.description)
    const canonical = document.querySelector('link[rel="canonical"]')
    if (meta.path) canonical?.setAttribute('href', SITE.origin + meta.path)
  }, [route])
}
