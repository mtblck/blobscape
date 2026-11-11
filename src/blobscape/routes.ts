import { useEffect, useState } from 'react'

/**
 * Pages live in the URL hash (#/lesson/one-blob, #/sandbox), so the whole
 * thing is one static page: no server routes, and it can move to its own
 * domain by copying the folder.
 */
export type Route = { page: 'home' } | { page: 'lesson'; id: string } | { page: 'sandbox' }

export const LESSONS = [
  { id: 'one-blob', title: 'One blob', summary: 'Seven kinds of number make one Gaussian. Pull each one and see what it does.' },
  { id: 'footprint', title: 'Footprint', summary: 'A 3D blob lands on screen as a 2D ellipse. Orbit it and watch the shadow it casts change.' },
  { id: 'order', title: 'Order matters', summary: 'See-through blobs only blend right when drawn back to front. Draw them in the wrong order.' },
  { id: 'many', title: 'Many make a shape', summary: 'From one blob to twenty thousand: when does a pile of blobs become a solid object?' },
] as const

export const COMING = [
  { title: 'Colour by angle', summary: 'Spherical harmonics: a blob that is red from the front and blue from the side.' },
  { title: 'Paint', summary: 'Spray blobs onto surfaces by hand, and trade blob size against count.' },
  { title: 'Where splats come from', summary: 'Load a real capture, compare file formats, and see how training fits blobs to photos.' },
  { title: 'Break it', summary: 'Shrink every blob to a dot and explode the scene: there are no surfaces, only blobs.' },
]

export function parse(hash: string): Route {
  const m = hash.replace(/^#\/?/, '').split('/')
  if (m[0] === 'lesson' && LESSONS.some((l) => l.id === m[1])) return { page: 'lesson', id: m[1] }
  if (m[0] === 'sandbox') return { page: 'sandbox' }
  return { page: 'home' }
}

export function href(r: Route): string {
  if (r.page === 'lesson') return `#/lesson/${r.id}`
  if (r.page === 'sandbox') return '#/sandbox'
  return '#/'
}

export function go(r: Route) {
  window.location.hash = href(r)
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash))
  useEffect(() => {
    const on = () => setRoute(parse(window.location.hash))
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}
