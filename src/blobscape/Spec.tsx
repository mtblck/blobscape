import spec from '../../docs/rigged-splats.md?raw'
import { href } from './routes.ts'
import { Crumbs, useFocusHeading } from './Shell.tsx'
import { specHtml, specTitle, SPEC } from './specCopy.ts'

const HTML = specHtml(spec)

/** The rigged-splat spec as a page: the text of docs/rigged-splats.md, read by `markdown.ts` (which escapes everything but its own tags). */
export function Spec() {
  const h1 = useFocusHeading()
  return (
    <article className="max-w-3xl pb-8">
      <Crumbs here={SPEC.crumb} parent={{ label: 'Engine', href: href({ page: 'engine' }) }} />
      <h1 ref={h1} tabIndex={-1} className="pt-6 font-display text-5xl outline-none">{specTitle(spec)}</h1>
      <div className="spec" data-testid="spec" dangerouslySetInnerHTML={{ __html: HTML }} />
    </article>
  )
}
