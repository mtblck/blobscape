import { useEffect, useMemo, useRef } from 'react'
import { tipjar, tuck } from 'tipjar'
import 'tipjar/style.css'
import { type Route } from './routes.ts'
import { SITE } from './site.ts'
import { pageMeta } from './meta.ts'

/**
 * The floating tip button, on the front page and the lesson list only: on a
 * lesson or the sandbox it would sit on top of the controls. It tucks away
 * once the footer, which has its own support link, scrolls into view.
 */
export function TipButton() {
  const holder = useRef<HTMLElement>(null)
  // tipjar() escapes everything it is given and only allows http(s) links, so its markup is safe to insert
  const html = useMemo(() => tipjar({ href: SITE.tip, description: `${SITE.name} on Ko-fi`, icon: 'heart', newTab: true, enter: 'fade' }), [])
  useEffect(() => {
    const button = holder.current?.firstElementChild
    return button instanceof HTMLElement ? tuck(button, 'footer') : undefined
  }, [])
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
