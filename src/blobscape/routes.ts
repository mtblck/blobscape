import { useEffect, useState } from 'react'
import type { Goal } from './progress.ts'

/**
 * Pages live in the URL hash (#/lesson/one-blob, #/sandbox), so the whole
 * thing is one static page: no server routes, and it can move to its own
 * domain by copying the folder.
 */
export type Route = { page: 'home' } | { page: 'lesson'; id: string } | { page: 'sandbox' }

export const LESSONS = [
  { id: 'one-blob', title: 'One blob', summary: 'Five kinds of number, 14 in all, make one Gaussian. Pull each one and see what it does.' },
  { id: 'footprint', title: 'Footprint', summary: 'A 3D blob lands on screen as a 2D ellipse. Orbit it and watch the shadow it casts change.' },
  { id: 'order', title: 'Order matters', summary: 'See-through blobs only blend right when drawn back to front. Draw them in the wrong order.' },
  { id: 'many', title: 'Many make a shape', summary: 'From one blob to twenty thousand: when does a pile of blobs become a solid object?' },
] as const

/**
 * Each lesson's goals, in one place so the home page can count them. The
 * check for each goal lives with its lesson, keyed by these ids.
 */
export const LESSON_GOALS: Record<(typeof LESSONS)[number]['id'], Goal[]> = {
  'one-blob': [
    { id: 'pancake', label: 'Squash it into a pancake', hint: 'Make one size much smaller than the other two.', where: 'shape', why: 'Three sizes set the shape. Make one tiny and the blob goes flat.' },
    { id: 'needle', label: 'Stretch it into a needle', hint: 'Make one size much bigger than the other two.', where: 'shape', why: 'The same three numbers, set differently, give a completely different blob.' },
    { id: 'tilt', label: 'Turn it', where: 'turn', why: 'Turning changes which way the shape points, not the shape itself.' },
    { id: 'ghost', label: 'Make it a ghost', hint: 'Turn the opacity right down, but not to nothing.', where: 'look', why: 'Opacity is how much the very centre covers. It always fades out towards the edge.' },
  ],
  'footprint': [
    { id: 'round', label: 'Find an angle where the footprint is round', hint: 'Look straight at the flat face.', where: 'view', why: 'Face on, a flat blob covers the most screen it can: a full circle.' },
    { id: 'line', label: 'Make the footprint a thin line', hint: 'Look at it edge-on.', where: 'view', why: 'Edge on, the same blob covers almost nothing. What lands on screen depends on where you look from.' },
    { id: 'hard', label: 'Cut the reach to 1σ or less and see the hard edge', where: 'reach', why: 'Stop drawing too soon and the soft edge gets chopped off: speed traded for smoothness.' },
  ],
  'order': [
    { id: 'wrong', label: 'See list order get it wrong', hint: 'Compare the two views: which blob looks in front?', where: 'view', why: 'Blending assumes each new blob is in front. Draw the far one last and it paints over the near one.' },
    { id: 'luck', label: 'Turn the camera until list order happens to be right', hint: 'Go round the back.', where: 'camera', why: 'From behind, the stored order happens to run back to front, so it looks right by luck.' },
    { id: 'reversed', label: 'Draw front to back', where: 'order', why: 'Front to back is exactly backwards: the nearest blob ends up buried.' },
    { id: 'opaque', label: 'Make the blobs fully opaque while the order is wrong', hint: 'Now the wrong blob hides the right one completely.', where: 'look', why: 'With nothing see-through, a wrong order no longer just looks muddy: it hides blobs that should be in front.' },
  ],
  'many': [
    { id: 'few', label: 'Go below 30 blobs and watch the shape fall apart', where: 'count', why: 'With so few, each blob has to be huge to cover the surface, so the shape turns lumpy.' },
    { id: 'lots', label: 'Go past 5,000 blobs', where: 'count', why: 'Thousands of small blobs make a smooth surface. Real captures use millions.' },
    { id: 'balls', label: 'Swap the flat discs for round balls', hint: 'Look at the outline: round blobs make a lumpier edge.', where: 'blobs', why: 'Round balls bulge out past the surface at the edge; flat discs lie along it.' },
    { id: 'gaps', label: 'Shrink the blobs until you can see through the gaps', where: 'count', why: 'Shrink them and the surface turns to dust: there is nothing between the blobs.' },
  ],
}

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
    const on = () => {
      const h = window.location.hash
      // In-page anchors such as the skip link's #main aren't pages: stay where we are
      if (h && h !== '#' && !h.startsWith('#/')) return
      setRoute(parse(h))
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}
