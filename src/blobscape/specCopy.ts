import { SITE } from './site.ts'
import { mdToHtml, mdTitle } from './markdown.ts'

/**
 * The rigged-splat spec page (/engine/rigged-splats/): docs/rigged-splats.md shown as a page,
 * so the file in the repo and the page are one text. The page (Spec.tsx) takes the text from
 * Vite and the prerender reads the file; both turn it into HTML here.
 */
export const SPEC = {
  crumb: 'Rigged-splat spec',
  description: 'A draft glTF extension for rigged, animated Gaussian splats: one rule for how a skinned splat turns and grows with its bones, on top of KHR_gaussian_splatting and standard glTF skins. With an example, sample .glb files and notes on other viewers.',
} as const

/** A link in the document, as an address on the site: the sample files sit in public/, and our own pages need no origin. */
export function specLink(url: string): string {
  if (url.startsWith('../public/')) return url.slice('../public'.length)
  if (url.startsWith(SITE.origin + '/')) return url.slice(SITE.origin.length)
  return url
}

export const specTitle = (md: string) => mdTitle(md)
/** The body of the spec, without its title (the page has its own h1). */
export const specHtml = (md: string) => mdToHtml(md, { title: false, link: specLink })
