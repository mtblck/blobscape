// Every Blobscape page on a desktop and on a phone: it opens with focus on its
// heading, never scrolls sideways, and passes axe. One part per page, so a
// change to one page sweeps just that page.

const B = 'src/blobscape/'
const L = (f) => [`${B}lessons/${f}.tsx`]
const PAGES = {
  lessons: [`${B}routes.ts`], 'one-blob': L('OneBlob'), footprint: L('Footprint'), order: L('Order'), many: L('Many'), angle: L('Angle'), paint: L('Paint'),
  formats: L('Formats'), break: L('Break'), 'one-bone': L('OneBone'), weights: L('Weights'), twist: L('Twist'), walk: L('Walk'), feet: L('Feet'), model: L('Model'),
  morphs: L('Morphs'), fur: L('Fur'), shoot: L('Shoot'), fuzzy: L('Fuzzy'), floaters: L('Floaters'), lighting: L('Lighting'), shimmer: L('Shimmer'), 'first-creature': L('FirstCreature'), 'scene-data': L('SceneData'), 'pixel-art': L('PixelArt'), sandbox: [`${B}Sandbox.tsx`],
  creature: [`${B}Creature.tsx`], 'forest-walk': [`${B}ForestWalk.tsx`], 'wading-pond': [`${B}WadingPond.tsx`], clockwork: [`${B}Clockwork.tsx`], 'shape-shifter': [`${B}ShapeShifter.tsx`], 'sand-snow-goo': [`${B}SandSnowGoo.tsx`], 'brush-and-ink': [`${B}BrushInk.tsx`], 'four-ways': [`${B}FourWays.tsx`], 'day-and-night': [`${B}DayNight.tsx`], 'seasonal-bouquets': [`${B}Bouquets.tsx`],
  'pixel-diorama': [`${B}PixelDiorama.tsx`], 'dungeon-run': [`${B}DungeonRun.tsx`], 'scan-studio': [`${B}ScanStudio.tsx`], contact: [`${B}Contact.tsx`], 'whats-new': [`${B}WhatsNew.tsx`, `${B}news.ts`],
}
// the front page is a part of its own
const PARTS = { home: [`${B}Landing.tsx`], ...PAGES }
// what every page is drawn inside
const SHELL = ['src/shared/SiteHeader.tsx', 'src/shared/Footer.tsx', 'src/shared/Logo.tsx', `${B}Chrome.tsx`, `${B}Shell.tsx`]
const SHELL_FILES = [`${B}App.tsx`, `${B}main.tsx`, `${B}ssr.tsx`, 'src/shared/theme.css', 'index.html']
// headless WebGPU can't present to a canvas, so the engine pages draw off-screen here
const OFFSCREEN = ['creature', 'forest-walk', 'wading-pond', 'clockwork', 'shape-shifter', 'sand-snow-goo', 'brush-and-ink', 'four-ways', 'day-and-night', 'seasonal-bouquets', 'pixel-diorama', 'dungeon-run', 'scan-studio']
// and so do the lessons drawn by the engine
const ENGINE_LESSONS = ['first-creature', 'scene-data', 'pixel-art']
const pathOf = (id) => (OFFSCREEN.includes(id) ? `/experiments/${id}/?offscreen=1` : ['sandbox', 'lessons', 'contact', 'whats-new'].includes(id) ? `/${id}/` : `/lessons/${id}/${ENGINE_LESSONS.includes(id) ? '?offscreen=1' : ''}`)

// each sweep in two halves that run side by side: the front page and lessons, then the rest
const LESSON_PAGES = Object.keys(PAGES).filter((id) => pathOf(id).startsWith('/lessons/'))
const halves = { lessons: ['home', ...LESSON_PAGES], rest: Object.keys(PAGES).filter((id) => !LESSON_PAGES.includes(id)) }

const sweep = (label, opts, half) => ({
  name: `pages-${label}-${half}`,
  about: `${half === 'lessons' ? 'the front page and every lesson' : 'the sandbox, experiments and contact'} on a ${label}: focus on the heading, no sideways scroll, axe, a screenshot`,
  entries: SHELL,
  files: SHELL_FILES,
  parts: Object.fromEntries(halves[half].map((id) => [id, PARTS[id]])),
  async run({ base, shots, join, fails, ok, open, axe, wants }) {
    const { page, ctx } = await open('/', opts)
    if (half === 'lessons' && wants('home')) {
      const lessons = await page.locator('main a[href^="/lessons/"]:not([href="/lessons/"])').evaluateAll((as) => new Set(as.map((a) => a.getAttribute('href'))).size)
      if (lessons < 17) fails.push(`blobscape ${label}: home lists ${lessons} lessons`)
      else ok(`blobscape ${label}: home lists the lessons`)
      await axe(page, `blobscape ${label} home`)
      await page.screenshot({ path: join(shots, `blobscape-home-${label}.png`), fullPage: true })
    }
    for (const id of halves[half]) {
      if (id === 'home' || !wants(id)) continue
      await page.goto(base + pathOf(id))
      await page.waitForTimeout(1500)
      const focused = await page.evaluate(() => document.activeElement?.tagName)
      if (focused !== 'H1') fails.push(`blobscape ${label} ${id}: focus is on ${focused}, not the heading`)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      if (overflow > 0) fails.push(`blobscape ${label} ${id}: page scrolls sideways by ${overflow}px`)
      await axe(page, `blobscape ${label} ${id}`)
      await page.screenshot({ path: join(shots, `blobscape-${id}-${label}.png`), fullPage: label === 'phone' })
    }
    await ctx.close()
  },
})

const DESKTOP = { viewport: { width: 1440, height: 1000 } }
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
export default [
  sweep('desktop', DESKTOP, 'lessons'), sweep('desktop', DESKTOP, 'rest'),
  sweep('phone', PHONE, 'lessons'), sweep('phone', PHONE, 'rest'),
]
