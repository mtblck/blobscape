// a sheet of bouquets to choose from, not a reel
const shots = []
for (const season of ['spring', 'summer', 'fall', 'winter']) for (const seed of [3, 7, 12, 21, 34, 58]) shots.push({ seconds: 1, params: { season, seed: String(seed) }, caption: `${season} ${seed}` })
export default { title: 'Candidates', page: '/experiments/seasonal-bouquets/', hook: '__bouquet', view: '[data-testid=bouquet-view]', loading: '[data-testid=bouquet-loading]', params: { detail: 'light' }, shots }
