import { mdToHtml, slug } from '../markdown.ts'
import { SITE } from '../site.ts'

/** Sections of the package's README the docs page leaves out: its license line. */
const SKIP = new Set(['License'])

export interface GuideSection { id: string; title: string; html: string }

/**
 * The package's README as the docs page's getting-started guide: each second-level section, so the page and the
 * README on npm are one text. Links to this site become paths, so they stay in the app.
 */
export function guideSections(readme: string): GuideSection[] {
  const out: GuideSection[] = []
  for (const part of readme.replace(/\r\n/g, '\n').split(/^## /m).slice(1)) {
    const end = part.indexOf('\n')
    const title = part.slice(0, end).trim()
    if (SKIP.has(title)) continue
    out.push({ id: slug(title), title, html: mdToHtml(part.slice(end + 1), { link: (url) => (url.startsWith(SITE.origin + '/') ? url.slice(SITE.origin.length) : url) }) })
  }
  return out
}
