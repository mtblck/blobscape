import { LESSONS, LESSON_COUNT, href, type Route } from './routes.ts'
import { EXPERIMENTS, SITE } from './site.ts'
import { SPEC } from './specCopy.ts'

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
      return { path, title: `Sandbox · ${SITE.name}`, description: 'Spray, select, move, recolor and explode Gaussian splats, or open your own .ply, .spz, .splat, .ksplat or .sog capture. Nothing is uploaded.' }
    case 'creature':
      return { path, title: `Splat Creatures · ${SITE.name}`, description: 'A crocodile, a jellyfish, an owl, a frog, a fox, an elf and an ice dragon made of blobs, moving on their own splat engine: a walk, a swim, a jump, a tongue flick, wing beats and fire. See the bones under the blobs, then download one as a rigged, animated .glb (as Gaussian splats or as a mesh for Blender and game engines) or as a pixel-art sprite sheet from 4 or 8 sides.' }
    case 'forest':
      return { path, title: `Forest Walk · ${SITE.name}`, description: 'Walk an elf made of blobs down an endless forest path, from behind, a fox trotting at its side, while trees, ferns, flowers and mushrooms grow out of the ground as you come. Every plant is a rig of Gaussian splats on our own splat engine.' }
    case 'dungeon':
      return { path, title: `Dungeon Run · ${SITE.name}`, description: 'Fight slimes in a torchlit dungeon with a sword, fire and frost. The hero, the hall and five colors of slime are all Gaussian splats on our own splat engine, with fire and frost that spread across the floor, waves, and slimes that burst into splats.' }
    case 'scan':
      return { path, title: `Scan Studio · ${SITE.name}`, description: 'Open a Gaussian splat scan of an object from your phone (Scaniverse, Polycam and others export .ply or .spz), find the table and turn it level, cut away the floor and the floaters, relight it with live lights, then take it into the sandbox or save it. Everything stays on your device.' }
    case 'shift':
      return { path, title: `Shape Shifter · ${SITE.name}`, description: 'One creature made of Gaussian splats turns into another: a frog into a dragon, an owl into a crocodile. Every blob finds a partner in the other creature and travels to it, blending its size, facing and color on the way. Pick the pair, send the blobs straight, in a swirl, through a puddle or out in a burst, and see what pairing by place is for.' }
    case 'clockwork':
      return { path, title: `Clockwork · ${SITE.name}`, description: 'A watch movement made of Gaussian splats, keeping the real time: barrel, going train, escape wheel, pallet fork and a balance swinging five times a second, every wheel a bone turning by a real watch\'s ratios. Slow it down to see one tick, or speed it up to watch the hours go.' }
    case 'diorama':
      return { path, title: `Pixel Diorama · ${SITE.name}`, description: 'A lighthouse at dusk made of Gaussian splats and drawn as moving pixel art: shapes written in code, cut into a grid of solid blobs, moved by bones, then rendered small and snapped to a palette. Turn the scene, change the palette, pixel size, dither and glow, or switch the pixels off to see the blobs.' }
    case 'experiments':
      return { path, title: `Experiments · ${SITE.name}`, description: `Small tools built from Gaussian splats: ${EXPERIMENTS.map((e) => e.title).join(', ')}. Free, in your browser.` }
    case 'engine':
      return { path, title: `The Blobscape engine · ${SITE.name}`, description: 'A small engine for Gaussian splats that move, built on three.js: creatures on bones, whole worlds in one sort, live lights, pixel art from 3D and rigged splats saved as .glb. Three live demos, what it does, and how to use it.' }
    case 'spec':
      return { path, title: `Rigged Gaussian splats in glTF · ${SITE.name}`, description: SPEC.description }
    case 'contact':
      return { path, title: `Get in touch · ${SITE.name}`, description: `Send ${SITE.author.name} a note about ${SITE.name}: a question, a bug, an idea for a lesson or an experiment.` }
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
