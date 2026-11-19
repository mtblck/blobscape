/**
 * The Seasonal Bouquets reel (`npm run reel -- seasonal-bouquets`): the four seasons, the vases, the painted looks
 * and cel shading, in cuts of a second or two.
 *
 * A reel names its page, the `window` hook that page gives the browser checks (it must hold `stage`, with `frame(t)`
 * and `orbit`), the canvas, the mark shown while the page is busy, and its shots. A shot is `seconds` long, with
 * `params` for the address, `at` (the scene's own clock at its first frame), a camera `from` and `to` told from
 * the view the page starts in (`azimuth` and `elevation` in degrees, `zoom` 2 for twice as near, `lift` to look
 * higher, as a share of the starting distance), an `ease` (linear, inout, out, in), a `caption` (a word, or a small
 * line and a word; `dark` for a dark backdrop) and `calls`: things on the hook to call at a moment of the shot.
 */
const turn = (a, b, more = {}) => ({ from: { azimuth: a, ...more }, to: { azimuth: b } })
const near = (zoom, lift, a, b, push = 1.12) => ({ from: { azimuth: a, zoom, lift, elevation: 16 }, to: { azimuth: b, zoom: zoom * push }, ease: 'out' })

const SPRING = { season: 'spring', seed: '7' }
const SUMMER = { season: 'summer', seed: '12', backdrop: 'sage' }
const FALL = { season: 'fall', seed: '3' }
const WINTER = { season: 'winter', seed: '21', backdrop: 'dusk' }
const LOOKS = { season: 'summer', seed: '34', vase: 'ceramic' }

export default {
  title: 'Seasonal Bouquets',
  line: 'Every flower grown from a recipe, petal by petal',
  page: '/experiments/seasonal-bouquets/',
  hook: '__bouquet',
  view: '[data-testid=bouquet-view]',
  loading: '[data-testid=bouquet-loading]',
  params: { detail: 'fine' },
  shots: [
    { seconds: 2, params: SPRING, ...turn(4, 34), caption: 'Spring' },
    { seconds: 1.3, params: SPRING, at: 2, ...near(2.3, 0.1, 50, 62) },
    { seconds: 1.8, params: SUMMER, ...turn(350, 378), caption: 'Summer' },
    { seconds: 1.3, params: SUMMER, at: 1.8, ...near(2.4, 0.11, 20, 8) },
    { seconds: 1.8, params: FALL, ...turn(10, 38), caption: 'Fall' },
    { seconds: 2, params: FALL, at: 1.8, from: { azimuth: 44, zoom: 1.7, lift: -0.02, elevation: 14 }, to: { azimuth: 54, zoom: 1.85 }, ease: 'out', calls: [{ at: 0, call: 'shed' }, { at: 0.25, call: 'shed' }, { at: 0.5, call: 'shed' }, { at: 0.8, call: 'shed' }] },
    { seconds: 1.8, params: WINTER, ...turn(8, 36), caption: 'Winter', dark: true },
    { seconds: 1.3, params: WINTER, at: 1.8, ...near(2.2, 0.1, 330, 342), dark: true },
    { seconds: 0.8, params: { season: 'spring', seed: '21', vase: 'jar', backdrop: 'blush' }, ...turn(16, 24), caption: ['In a', 'Jam jar'] },
    { seconds: 0.8, params: { season: 'summer', seed: '58', vase: 'bucket', backdrop: 'sage' }, ...turn(16, 24), caption: ['In a', 'Bucket'] },
    { seconds: 0.8, params: { season: 'winter', seed: '7', vase: 'glass' }, ...turn(16, 24), caption: ['In a', 'Glass vase'] },
    { seconds: 0.8, params: { season: 'fall', seed: '34', vase: 'boot', backdrop: 'dusk' }, ...turn(16, 24), caption: ['In a', 'Rain boot'], dark: true },
    { seconds: 1.1, params: { ...LOOKS, look: 'gouache' }, at: 0, ...turn(0, 14), caption: ['Drawn in', 'Gouache'] },
    { seconds: 1.1, params: { ...LOOKS, look: 'oil' }, at: 1.1, ...turn(14, 28), caption: ['Drawn in', 'Oil'] },
    { seconds: 1.1, params: { ...LOOKS, look: 'ink' }, at: 2.2, ...turn(28, 42), caption: ['Drawn in', 'Ink and wash'] },
    { seconds: 2, params: { ...LOOKS, look: 'cel' }, at: 3.3, ...turn(42, 72), caption: ['Drawn in', 'Cel shading'] },
    { seconds: 1.3, params: { ...LOOKS, look: 'cel', backdrop: 'dusk' }, at: 5.3, ...near(2.2, 0.1, 80, 92), dark: true },
    { seconds: 2.6, params: { season: 'summer', seed: '3', size: 'armful', shape: 'garden', backdrop: 'dark' }, from: { azimuth: -30, zoom: 1.25, lift: 0.02 }, to: { azimuth: 40, zoom: 1 }, ease: 'inout', caption: ['A florist that', 'never repeats'], dark: true },
  ],
}
