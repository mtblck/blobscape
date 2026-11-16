/**
 * A small Markdown reader for our own documents (the rigged-splat spec page), so the page
 * and the file in docs/ are one text. It knows only what those documents use: headings,
 * paragraphs, fenced code, quotes, flat lists, bold, italic, code, links and <sub>.
 * Everything else is escaped, so a document can't put markup of its own on the page.
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A heading's id: its words in lower case, joined by dashes. */
export const slug = (s: string) => s.toLowerCase().replace(/[`*]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export type MdOptions = {
  /** Where a link should point on the page (a file's path in the repo is not its address on the site). */
  link?: (url: string) => string
}

function inline(text: string, o: MdOptions): string {
  const kept: string[] = []
  const keep = (html: string) => `\u0000${kept.push(html) - 1}\u0000`
  let s = text
  // code first, so nothing inside it is read as emphasis
  s = s.replace(/`([^`]+)`/g, (_, c: string) => keep(`<code>${esc(c)}</code>`))
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, url: string) => {
    const to = o.link ? o.link(url) : url
    if (!/^(https:\/\/|\/|#)/.test(to)) return label
    const file = /\.[a-z0-9]{2,5}$/.test(to) && to.startsWith('/')
    return keep(`<a href="${esc(to)}"${file ? ' download' : ''}>`) + label + keep('</a>')
  })
  s = esc(s).replace(/&lt;(\/?)sub&gt;/g, '<$1sub>')
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>')
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => kept[+i]).replace(/\u0000(\d+)\u0000/g, (_, i: string) => kept[+i])
}

/** The document as HTML. A first-level heading is left out when `title` is false, for a page that has its own. */
export function mdToHtml(md: string, o: MdOptions & { title?: boolean } = {}): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  const run = (test: (l: string) => boolean) => {
    const got: string[] = []
    while (i < lines.length && test(lines[i])) got.push(lines[i++])
    return got
  }
  while (i < lines.length) {
    const l = lines[i]
    if (!l.trim()) { i++; continue }
    if (l.startsWith('```')) {
      i++
      const code = run((x) => !x.startsWith('```'))
      i++
      out.push(`<pre tabindex="0"><code>${esc(code.join('\n'))}</code></pre>`)
      continue
    }
    const h = /^(#{1,4}) (.+)$/.exec(l)
    if (h) {
      i++
      if (h[1].length > 1 || o.title !== false) out.push(`<h${h[1].length} id="${slug(h[2])}">${inline(h[2], o)}</h${h[1].length}>`)
      continue
    }
    if (l.startsWith('> ')) {
      out.push(`<blockquote><p>${inline(run((x) => x.startsWith('> ')).map((x) => x.slice(2)).join(' '), o)}</p></blockquote>`)
      continue
    }
    if (l.startsWith('- ')) {
      out.push(`<ul>${run((x) => x.startsWith('- ')).map((x) => `<li>${inline(x.slice(2), o)}</li>`).join('')}</ul>`)
      continue
    }
    out.push(`<p>${inline(run((x) => !!x.trim() && !/^(```|#{1,4} |> |- )/.test(x)).join(' '), o)}</p>`)
  }
  return out.join('\n')
}

/** The words of a document's first-level heading. */
export function mdTitle(md: string): string {
  return /^# (.+)$/m.exec(md)?.[1] ?? ''
}
