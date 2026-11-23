import { LESSONS, LESSON_COUNT, href, type Route } from './routes.ts'
import { EXPERIMENTS, SITE } from './site.ts'
import { SPEC } from './specCopy.ts'
import { API_PAGE } from './api/types.ts'
import { NEWS, POSTS, postById } from './news.ts'

/**
 * Each page's title and description. The app sets them as you move around
 * (usePageMeta) and scripts/prerender.ts writes them into each page's HTML,
 * so a tab, a bookmark, a link preview and a search result all say where they lead.
 */
export interface PageMeta {
  title: string
  /** The page in full: what a shared link shows under its title (og:description). */
  description: string
  /** The page in one or two short sentences, at most `SEARCH_MOST` characters: the meta description, which a search result shows whole. */
  search: string
  /** The page's path, '/' for the front page; null for the not-found page. */
  path: string | null
  /** The picture a shared link shows, and what it is of. Left out, the site's own (`SHARE`). */
  image?: { src: string; alt: string }
}

/** The picture a link shows when a page has none of its own (public/og.png, made by scripts/share-images.mjs). */
export const SHARE = { src: '/og.png', alt: 'The Blobscape logo and the words "Learn 3D Gaussian splats by taking them apart", beside four experiments: a pixel-art lighthouse, an ice dragon breathing frost, an elf standing in a pond in the rain and a cabin at dusk.' } as const

/** Where an experiment's share picture is: its cover cut to a link preview's shape (public/share/, made by scripts/share-images.mjs). */
export const shareImage = (e: { cover: string }) => e.cover.replace('/covers/', '/share/').replace(/\.webp$/, '.jpg')

/** Where a post's share picture is: a cover's cut, or a picture of its own (public/news/) cut the same way as public/share/news-<name>.jpg. */
export const postShare = (src: string) => (src.startsWith('/covers/') ? shareImage({ cover: src }) : src.startsWith('/news/') ? src.replace('/news/', '/share/news-').replace(/\.webp$/, '.jpg') : src)

/** A search result shows about this much of a description and of a title; longer ones are cut off mid-sentence. */
export const SEARCH_MOST = 160
export const TITLE_MOST = 60

/** A page's title with the site's name after it, where both fit in a search result. */
export const named = (title: string) => (`${title} · ${SITE.name}`.length <= TITLE_MOST ? `${title} · ${SITE.name}` : title)

/** A page's title, description and share picture. An experiment's page shows its own cover. */
export function pageMeta(route: Route): PageMeta {
  const words = wordsFor(route)
  const meta: PageMeta = { ...words, search: searchFor(route) ?? words.description }
  const e = EXPERIMENTS.find((x) => x.id === route.page)
  // a post shares its own picture, cut to a link preview's shape when it is an experiment's cover
  const post = route.page === 'post' ? postById(route.id) : undefined
  if (post) return { ...meta, image: { src: postShare(post.image.src), alt: post.image.alt } }
  return e ? { ...meta, image: { src: shareImage(e), alt: `${e.title}, an experiment on ${SITE.name}. ${e.body}` } } : meta
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

export const DESCRIPTION = `Learn how 3D Gaussian splats work by pulling one blob apart, then thousands, then rigging them to walk: ${LESSON_COUNT} hands-on lessons, a sandbox for real captures and a creature to take away as a 3D model, free in your browser.`

/**
 * What a search result says under each page's title: the page in at most `SEARCH_MOST` characters, so it is shown whole.
 * A page not listed here uses its description as it stands (a test holds that it fits).
 */
const SEARCH: Partial<Record<Route['page'], string>> = {
  home: `Learn how 3D Gaussian splats work by taking them apart: ${LESSON_COUNT} hands-on lessons, a sandbox for your own captures and a shelf of experiments.`,
  lessons: `${cap(LESSON_COUNT)} short, hands-on lessons on Gaussian splats, from one blob and its 14 numbers to rigs that walk, real captures and scenes built in code.`,
  creature: 'A crocodile, a jellyfish, an owl, a frog, a fox, an elf and a dragon made of Gaussian splats. Watch them move, then save one as a rigged .glb or sprite sheet.',
  forest: 'Walk an elf made of Gaussian splats down an endless forest path, a fox trotting at its side, while trees, ferns and flowers grow out of the ground as you come.',
  pond: 'Wade an elf made of Gaussian splats through a candlelit pond. The water is a real wave simulation: rings spread from each footfall and bounce off the banks.',
  dungeon: 'Fight slimes in a torchlit dungeon with a sword, fire and frost. Hero, hall and slimes are all Gaussian splats, with fire that spreads across the floor.',
  scan: 'Open a Gaussian splat scan from your phone, turn it level, cut away the floor and the floaters, relight it and save it. Everything stays on your device.',
  shift: 'One creature made of Gaussian splats turns into another: a frog into a dragon, an owl into a crocodile. Every blob finds a partner and travels to it.',
  islands: 'A floating island grown from a biome recipe and a number, out of Gaussian splats: hills, a path, trees and stones, each made of materials from one library.',
  bouquet: 'A florist that never makes the same bouquet twice: pick a season and it grows every flower petal by petal out of Gaussian splats and stands them in a vase.',
  daynight: 'A cabin in a forest clearing made of Gaussian splats, lit live through a whole day. Drag the time and the sun follows its real path for the place and season.',
  fourways: 'One pixel-art scene drawn four ways at the same moment: a hand-written shader, three.js meshes, Spark splats and Blobscape, on one clock, camera and light.',
  text: 'Gaussian splats drawn as text: ASCII, braille, blocks, box drawing, your own words or a typewriter, read off the 3D picture as it turns.',
  brush: 'Gaussian splats painted as brush marks and pen strokes: gouache, oil, ink and wash, hatching, stipple and watercolor. The strokes hold still as you turn it.',
  flow: 'Gaussian splats that flow: every blob is a particle of sand, snow or goo in a small material point simulation. Pour it, drop things in it, or let a column go.',
  clockwork: "A watch movement made of Gaussian splats, keeping the real time. Every wheel turns by a real watch's ratios: slow it down to see one tick of the escapement.",
  sandbox: 'Spray, select, recolor and blow up Gaussian splats, paint grass and fur, add creatures that walk about, or open your own capture. Nothing is uploaded.',
  creator: 'Make a moving pixel-art scene from Gaussian splats: set down props from a library, arrange them, light them, pick a style and export the loop as a video.',
  diorama: 'Moving 3D scenes made from Gaussian splats, drawn as pixel art, blocks, neon, stained glass, watercolor or ink. Turn them and change the style.',
  experiments: `${EXPERIMENTS.length} small things to play with, all built from Gaussian splats: games, simulations, pixel art, creatures and tools. Free, in your browser.`,
  engine: 'A small engine for Gaussian splats that move, built on three.js: creatures on bones, live lights, pixel art from 3D and rigged splats saved as .glb.',
  spec: 'A draft glTF extension for rigged, animated Gaussian splats: how a skinned splat turns and grows with its bones, with examples and sample .glb files.',
  api: 'How to use the @blobscape/engine package, and a reference for every name it exports: Stage, SplatWorld, bones, posing, cloth, morphs, scenes and pixel mode.',
  news: NEWS.intro,
}

function searchFor(route: Route): string | undefined {
  if (route.page === 'post') return postById(route.id)?.search
  if (route.page === 'notfound') return SEARCH.home
  return SEARCH[route.page]
}

function wordsFor(route: Route): Omit<PageMeta, 'search'> {
  const path = href(route)
  switch (route.page) {
    case 'lessons':
      return { path, title: `Lessons · ${SITE.name}`, description: `${cap(LESSON_COUNT)} short, hands-on lessons on Gaussian splats: ${LESSONS.map((l) => l.title.toLowerCase()).join(', ')}.` }
    case 'creator':
      return { path, title: `Scene Creator · ${SITE.name}`, description: 'Make a moving pixel-art scene out of Gaussian splats: start from a scene or a bare land, set down props from a library cut out of the Diorama scenes (a lighthouse, a windmill, a witch, dragons, a giant turkey), arrange them, set the sun, lamps and weather, pick pixel art or a painted look, and export the loop as a video. Your scenes are kept in your own browser.' }
    case 'sandbox':
      return { path, title: `Sandbox · ${SITE.name}`, description: 'Spray, select, move, recolor and explode Gaussian splats, paint grass and fur, add creatures that walk about, or open your own .ply, .spz, .splat, .ksplat or .sog capture or a photo. Nothing is uploaded.' }
    case 'creature':
      return { path, title: `Splat Creatures · ${SITE.name}`, description: 'A crocodile, a jellyfish, an owl, a frog, a fox, an elf and an ice dragon made of blobs, moving on their own splat engine: a walk, a swim, a jump, a tongue flick, wing beats and fire. See the bones under the blobs, then download one as a rigged, animated .glb (as Gaussian splats or as a mesh for Blender and game engines) or as a pixel-art sprite sheet from 4 or 8 sides.' }
    case 'forest':
      return { path, title: `Forest Walk · ${SITE.name}`, description: 'Walk an elf made of blobs down an endless forest path, from behind, a fox trotting at its side, while trees, ferns, flowers and mushrooms grow out of the ground as you come. Every plant is a rig of Gaussian splats on our own splat engine.' }
    case 'pond':
      return { path, title: `Wading Pond · ${SITE.name}`, description: 'Wade an elf made of blobs through a shallow pond in a ruin by candlelight. The water is a grid of heights stepped by the wave equation: rings come from each footfall, spread, and bounce off the banks. The candles are live lights that cast shadows, all on our own Gaussian splat engine.' }
    case 'dungeon':
      return { path, title: `Dungeon Run · ${SITE.name}`, description: 'Fight slimes in a torchlit dungeon with a sword, fire and frost. The hero, the hall and five colors of slime are all Gaussian splats on our own splat engine, with fire and frost that spread across the floor, waves, and slimes that burst into splats.' }
    case 'scan':
      return { path, title: `Scan Studio · ${SITE.name}`, description: 'Open a Gaussian splat scan of an object from your phone (Scaniverse, Polycam and others export .ply or .spz), find the table and turn it level, cut away the floor and the floaters, relight it with live lights, then take it into the sandbox or save it. Everything stays on your device.' }
    case 'shift':
      return { path, title: `Shape Shifter · ${SITE.name}`, description: 'One creature made of Gaussian splats turns into another: a frog into a dragon, an owl into a crocodile. Every blob finds a partner in the other creature and travels to it, blending its size, facing and color on the way. Pick the pair, send the blobs straight, in a swirl, through a puddle or out in a burst, and see what pairing by place is for.' }
    case 'islands':
      return { path, title: `Biome Islands · ${SITE.name}`, description: 'A floating island grown from a biome recipe and a number, out of Gaussian splats. The recipe says what kind of place it is and names its materials from one library (oak, birch, granite, loam, meadow turf); the number decides its outline, its hills, its path and where every tree and stone stands. The first step of a sky world of islands to walk across. A work in progress.' }
    case 'bouquet':
      return { path, title: `Seasonal Bouquets · ${SITE.name}`, description: 'A florist that never makes the same bouquet twice. Pick a season and it grows every flower from a recipe, petal by petal, out of Gaussian splats (peonies and tulips in spring, dahlias and wheat in fall, amaryllis and pine in winter), arranges them by the rules florists use, and stands them in a glass vase, a bucket, a pumpkin, a rain boot or a ceramic snowman. The stems sway and petals fall.' }
    case 'daynight':
      return { path, title: `Day and Night · ${SITE.name}`, description: 'A cabin in a forest clearing made of Gaussian splats, lit live through a whole day: drag the time and the sun follows its real path for the latitude and season, shadows turn and stretch, the sky reddens, the windows and a lantern come on at dusk, and birds give way to fireflies under the moon and stars.' }
    case 'fourways':
      return { path, title: `One Scene, Four Ways · ${SITE.name}`, description: 'One pixel-art scene (a fox in tall grass under a circling light, or a campfire) drawn four ways at the same moment: a shader written with no engine, three.js meshes, Spark splats and Blobscape. One clock, one camera and one light slider drive all four, with the same palette and dither, so you can see what each is made of, what moves, what the light can do and what a frame costs.' }
    case 'text':
      return { path, title: `Text Mode · ${SITE.name}`, description: 'Gaussian splats drawn as text on a grid of characters: ASCII by how much there is to show with strokes along edges, braille dots, quarter blocks, box-drawing lines that trace every edge, your own words written through the picture, or a typewriter striking keys over one another. The characters are read off the 3D picture live as it turns, and Copy as text gives you it in plain characters.' }
    case 'brush':
      return { path, title: `Brush and Ink · ${SITE.name}`, description: 'Gaussian splats painted as brush marks and pen strokes in place of soft dots: gouache, oil, ink and wash, hatching, stipple and watercolor. Every mark belongs to one blob and takes its shape and direction from it, so a scene, a creature or a scan reads as a painting from any side and the strokes hold still as you turn it.' }
    case 'flow':
      return { path, title: `Sand, Snow and Goo · ${SITE.name}`, description: 'Gaussian splats that flow: every blob is a particle of sand, snow or goo in a small material point simulation (MLS-MPM). Pour it onto a block, steps or into a bowl, drop a ball, cube or rock into a pile of it, or let a column go: sand heaps at its friction angle, snow breaks into clumps and packs, goo spreads. Each material has its own settings, and all three can run side by side.' }
    case 'clockwork':
      return { path, title: `Clockwork · ${SITE.name}`, description: 'A watch movement made of Gaussian splats, keeping the real time: barrel, going train, escape wheel, pallet fork and a balance swinging five times a second, every wheel a bone turning by a real watch\'s ratios. Slow it down to see one tick, or speed it up to watch the hours go.' }
    case 'diorama':
      return { path, title: `Diorama · ${SITE.name}`, description: 'Moving scenes made of Gaussian splats, a lighthouse, a dragon, a koi pond and more: shapes written as data, cut into a grid of solid blobs and moved by bones, then drawn as pixel art, blocks, neon, stained glass, watercolor, ink or ASCII. Turn a scene, change its time of day and style, and export the loop.' }
    case 'experiments':
      return { path, title: `Experiments · ${SITE.name}`, description: `Small tools built from Gaussian splats: ${EXPERIMENTS.map((e) => e.title).join(', ')}. Free, in your browser.` }
    case 'engine':
      return { path, title: `The Blobscape engine · ${SITE.name}`, description: 'A small engine for Gaussian splats that move, built on three.js: creatures on bones, whole worlds in one sort, live lights, pixel art from 3D and rigged splats saved as .glb. Three live demos, what it does, and how to use it.' }
    case 'spec':
      return { path, title: `Rigged Gaussian splats in glTF · ${SITE.name}`, description: SPEC.description }
    case 'api':
      return { path, title: `${API_PAGE.title} · ${SITE.name}`, description: API_PAGE.description }
    case 'contact':
      return { path, title: `Get in touch · ${SITE.name}`, description: `Send ${SITE.author.name} a note about ${SITE.name}: a question, a bug, an idea for a lesson or an experiment.` }
    case 'news':
      return { path, title: `What's New · ${SITE.name}`, description: `${NEWS.intro} The latest: ${POSTS[0].title}.` }
    case 'post': {
      const p = postById(route.id)!
      return { path, title: named(p.title), description: p.summary }
    }
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
