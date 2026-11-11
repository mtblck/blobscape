import { LESSONS, LESSON_COUNT, href, type Route } from './routes.ts'
import { EXPERIMENTS, SITE } from './site.ts'

/**
 * Each page's title and description. The app sets them as you move around
 * (usePageMeta) and scripts/prerender.ts writes them into each page's HTML,
 * so a tab, a bookmark, a link preview and a search result all say where they lead.
 */
export interface PageMeta {
  title: string
  description: string
  /** The page's path, '/' for the front page; null for the not-found page. */
  path: string | null
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

export const DESCRIPTION = `Learn how 3D Gaussian splats work by pulling one blob apart, then thousands, then rigging them to walk: ${LESSON_COUNT} hands-on lessons, a sandbox for real captures and a creature to take away as a 3D model, free in your browser.`

export function pageMeta(route: Route): PageMeta {
  const path = href(route)
  switch (route.page) {
    case 'lessons':
      return { path, title: `Lessons · ${SITE.name}`, description: `${cap(LESSON_COUNT)} short, hands-on lessons on Gaussian splats: ${LESSONS.map((l) => l.title.toLowerCase()).join(', ')}.` }
    case 'sandbox':
      return { path, title: `Sandbox · ${SITE.name}`, description: 'Spray, select, move, recolour and explode Gaussian splats, or open your own .ply, .spz, .splat, .ksplat or .sog capture. Nothing is uploaded.' }
    case 'creature':
      return { path, title: `Creature · ${SITE.name}`, description: 'A blob fox that walks on its own splat engine. Make it, then download it as a rigged, animated .glb: as Gaussian splats or as a mesh for Blender and game engines.' }
    case 'experiments':
      return { path, title: `Experiments · ${SITE.name}`, description: `Small tools built from Gaussian splats: ${EXPERIMENTS.map((e) => e.title).join(', ')}. Free, in your browser.` }
    case 'lesson': {
      const i = LESSONS.findIndex((l) => l.id === route.id)
      return { path, title: `${LESSONS[i].title} · Lesson ${i + 1} · ${SITE.name}`, description: LESSONS[i].summary }
    }
    case 'notfound':
      return { path: null, title: `Page not found · ${SITE.name}`, description: DESCRIPTION }
    default:
      return { path, title: `${SITE.name}: learn 3D Gaussian splats by taking them apart`, description: DESCRIPTION }
  }
}
