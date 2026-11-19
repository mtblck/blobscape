import assert from 'node:assert/strict'
import { test } from 'node:test'
import { COUNTS, SHAPES, SIZES, inWords, plan, varietiesIn, type Choice } from './arrange.ts'
import { DETAILS, MAX_FALLING, fallen, lowestOf, makeBouquet, poseBouquet, setShedding, shedOne, stemInVase } from './bouquet.ts'
import { FLOWERS, PALETTES, SEASONS, flower, inSeason, seasonOn, type Role } from './flowers.ts'
import { head } from './heads.ts'
import { Maker } from './make.ts'
import { TABLES, TABLE_HEIGHT, makeTable, tableFor } from './tables.ts'
import { SEASON_VASES, VASES, makeVase } from './vases.ts'

const ROLES: Role[] = ['focal', 'second', 'line', 'filler', 'green']
const COARSE = 0.014

test('every season has about ten flowers of its own, and enough of every role to fill the biggest bouquet', () => {
  for (const { id } of SEASONS) {
    const pool = inSeason(id)
    const blooms = pool.filter((f) => !f.roles.includes('green'))
    assert.ok(blooms.length >= 10, `${id} has ${blooms.length} flowers`)
    for (const role of ROLES) {
      const n = pool.filter((f) => f.roles.includes(role)).length
      assert.ok(n >= COUNTS.armful[role].length, `${id} has ${n} for ${role}`)
    }
  }
  assert.equal(new Set(FLOWERS.map((f) => f.id)).size, FLOWERS.length)
})

test('every palette of a season finds a focal flower and a second one in its colors', () => {
  for (const { id } of SEASONS) {
    for (const p of PALETTES[id]) {
      for (const role of ['focal', 'second'] as Role[]) {
        const fits = inSeason(id).filter((f) => f.roles.includes(role) && varietiesIn(f, p, role).length)
        assert.ok(fits.length >= 2, `${id} ${p.id} has ${fits.length} for ${role}`)
      }
    }
  }
})

test('the same choice gives the same plan, and another seed another', () => {
  const c: Choice = { season: 'summer', seed: 12, size: 'bouquet', shape: 'round' }
  assert.deepEqual(plan(c), plan({ ...c }))
  assert.notDeepEqual(plan(c).stems, plan({ ...c, seed: 13 }).stems)
})

test('a plan fills every role with the counts its size asks for, with no flower twice, in season and in the palette', () => {
  for (const { id: season } of SEASONS) {
    for (const { id: size } of SIZES) {
      for (let seed = 1; seed <= 12; seed++) {
        const p = plan({ season, seed, size, shape: 'round' })
        const where = `${season} ${size} ${seed}`
        for (const role of ROLES) {
          assert.deepEqual(p.lines.filter((l) => l.role === role).map((l) => l.count), COUNTS[size][role], `${where} ${role}`)
        }
        assert.equal(new Set(p.lines.map((l) => l.flower)).size, p.lines.length, `${where}: a flower twice`)
        assert.equal(p.stems.length, p.lines.reduce((n, l) => n + l.count, 0))
        for (const l of p.lines) {
          const f = flower(l.flower)
          assert.ok(f.seasons.includes(season), `${where}: ${f.id} is out of season`)
          assert.ok(f.roles.includes(l.role), `${where}: ${f.id} as ${l.role}`)
          if (l.role === 'focal') assert.ok(varietiesIn(f, p.palette, l.role).includes(l.variety), `${where}: ${inWords(l)} is not in the ${p.palette.id} palette`)
        }
        assert.ok(PALETTES[season].includes(p.palette))
        assert.ok(SEASON_VASES[season].includes(p.vase))
        // the focal blooms are an odd number of each kind or a pair beside three, never an even bunch alone
        assert.ok(p.lines.filter((l) => l.role === 'focal')[0].count % 2 === 1)
      }
    }
  }
})

test('focal blooms sit lower than line flowers, and every stem points up and out of the vase', () => {
  for (const { id: shape } of SHAPES) {
    for (let seed = 1; seed <= 8; seed++) {
      const p = plan({ season: 'spring', seed, size: 'bouquet', shape })
      const mean = (role: Role) => { const s = p.stems.filter((x) => x.role === role); return s.reduce((n, x) => n + x.length * x.dir[1], 0) / s.length }
      assert.ok(mean('focal') < mean('line'), `${shape} ${seed}: focal ${mean('focal')} line ${mean('line')}`)
      for (const s of p.stems) {
        assert.ok(Math.abs(Math.hypot(...s.dir) - 1) < 1e-6)
        assert.ok(s.dir[1] > -0.11, `${shape} ${seed}: ${s.flower} points down (${s.dir[1]})`)
      }
    }
  }
})

test('a chosen palette and vase are kept', () => {
  const p = plan({ season: 'fall', seed: 4, size: 'posy', shape: 'tall', palette: 'jewel', vase: 'boot' })
  assert.equal(p.palette.id, 'jewel')
  assert.equal(p.vase, 'boot')
})

test('every flower grows: its head has blobs, all finite, and no bigger than a bouquet', () => {
  for (const f of FLOWERS) {
    for (const v of f.varieties) {
      const m = new Maker(COARSE)
      head(m, f.head(v), 7)
      const b = m.blobs
      assert.ok(b.count > 8, `${f.id} ${v.name}: ${b.count} blobs`)
      for (let i = 0; i < b.count * 3; i++) {
        assert.ok(Number.isFinite(b.center[i]) && Math.abs(b.center[i]) < 4, `${f.id}: a blob at ${b.center[i]}`)
        assert.ok(Number.isFinite(b.scale[i]) && b.scale[i] >= 0, `${f.id}: a blob of size ${b.scale[i]}`)
        assert.ok(b.color[i] >= 0 && b.color[i] <= 1, `${f.id}: a color of ${b.color[i]}`)
      }
    }
  }
})

test('every vase builds, stands on the table and has a mouth for the stems', () => {
  for (const { id } of VASES) {
    for (let seed = 1; seed <= 3; seed++) {
      const m = new Maker(COARSE)
      const v = makeVase(m, id, seed)
      assert.ok(m.blobs.count > 200, `${id}: ${m.blobs.count} blobs`)
      assert.ok(v.name.length > 3 && v.mouth > 0.03 && v.top > 0.2 && v.top < 1 && v.foot >= v.mouth * 0.5, `${id}: ${JSON.stringify(v)}`)
      let low = Infinity
      for (let i = 0; i < m.blobs.count; i++) low = Math.min(low, m.blobs.center[i * 3 + 1])
      assert.ok(low > -0.03, `${id} goes ${low} under the table`)
    }
  }
})

test('a stem in a clear vase stays inside the glass from the floor to the mouth', () => {
  for (const id of ['glass', 'jar'] as const) {
    for (let seed = 1; seed <= 12; seed++) {
      const v = makeVase(new Maker(COARSE), id, seed)
      assert.ok(v.clear && v.inside, `${id} ${seed} has no inside`)
      for (let k = 0; k < 16; k++) {
        const a = k * 0.7, r = 0.004 + 0.002 * (k % 4)
        // the widest a stem is asked to stand, leaving by the far side of the mouth
        const foot: [number, number, number] = [-Math.cos(a) * v.mouth * 0.7 - 0.015, v.floor + 0.01, -Math.sin(a) * v.mouth * 0.7 + 0.015]
        const mouth: [number, number, number] = [Math.cos(a) * v.mouth * 0.62, v.top - 0.01, Math.sin(a) * v.mouth * 0.62]
        for (const p of stemInVase(v, foot, mouth, r)) {
          assert.ok(Math.hypot(p[0], p[2]) + r <= v.inside!(p[1]) + 1e-9, `${v.name} (${seed}): a stem ${Math.hypot(p[0], p[2])} out at ${p[1]}, where the glass is ${v.inside!(p[1])}`)
        }
      }
    }
  }
})

test('every table has a top at the vase\'s foot and legs down to the ground, and a seed picks each of them', () => {
  for (const { id } of TABLES) {
    for (let seed = 1; seed <= 3; seed++) {
      const m = new Maker(COARSE)
      const t = makeTable(m, id, 0.15, seed)
      assert.ok(m.blobs.count > 500 && t.name.length > 5, `${id}: ${m.blobs.count} blobs`)
      assert.equal(m.spacing, COARSE, `${id} left the maker coarser than it found it`)
      let high = -Infinity, low = Infinity, under = 0
      for (let i = 0; i < m.blobs.count; i++) {
        const y = m.blobs.center[i * 3 + 1]
        high = Math.max(high, y); low = Math.min(low, y)
        if (y < -TABLE_HEIGHT * 0.5) under++
      }
      assert.ok(Math.abs(high) < 0.005, `${id}: its top is at ${high}`)
      assert.ok(low < t.ground + 0.08 && low > t.ground - 0.03, `${id}: it goes down to ${low}, the ground is ${t.ground}`)
      assert.ok(under > 100, `${id}: ${under} blobs of leg`)
      for (let a = 0; a < 6.28; a += 0.3) assert.ok(t.reach(Math.cos(a), Math.sin(a)) > 0.5, `${id} reaches ${t.reach(Math.cos(a), Math.sin(a))}`)
    }
  }
  const picked = new Set(Array.from({ length: 60 }, (_, i) => tableFor(i + 1)))
  assert.equal(picked.size, TABLES.length)
})

test('a chosen table is kept, changes nothing else, and every petal lands on it', () => {
  const c: Choice = { season: 'spring', seed: 3, size: 'bouquet', shape: 'round' }
  for (const { id } of TABLES) {
    const b = makeBouquet({ ...c, table: id }, COARSE)
    assert.equal(b.table.kind, id)
    assert.deepEqual({ ...b.plan, choice: c }, plan(c))
    for (const f of b.falling) {
      const far = Math.hypot(f.land[0], f.land[2])
      assert.ok(far < b.table.reach(f.land[0] / far, f.land[2] / far) - 0.03, `${id}: a petal lands ${far} out`)
    }
  }
  assert.equal(makeBouquet(c, COARSE).table.kind, tableFor(c.seed))
})

test('a bouquet is one actor: three bones a stem, every blob on a bone, well under the 256 a blob can name', () => {
  for (const { id: season } of SEASONS) {
    const b = makeBouquet({ season, seed: 2, size: 'armful', shape: 'garden' }, COARSE)
    assert.equal(b.stems.length, b.plan.stems.length)
    assert.ok(b.skeleton.count === 1 + 3 * b.stems.length + b.falling.length && b.skeleton.count < 256, `${season}: ${b.skeleton.count} bones`)
    assert.equal(b.partOf.length, b.blobs.count)
    for (let i = 0; i < b.blobs.count; i++) {
      assert.ok(b.skin.joints[i * 4] < b.skeleton.count)
      assert.ok(Number.isFinite(b.blobs.center[i * 3 + 1]))
    }
    assert.ok(b.height > 0.5 && b.height < 2.6 && b.width > 0.2 && b.width < 1.6, `${season}: ${b.height} high, ${b.width} wide`)
    assert.ok(b.falling.length <= MAX_FALLING)
  }
  assert.ok(DETAILS.every((d, i) => i === 0 || d.spacing < DETAILS[i - 1].spacing))
})

test('the same choice builds the same blobs', () => {
  const c: Choice = { season: 'winter', seed: 9, size: 'posy', shape: 'round' }
  const a = makeBouquet(c, COARSE), b = makeBouquet(c, COARSE)
  assert.equal(a.blobs.count, b.blobs.count)
  assert.deepEqual(a.blobs.center.slice(0, a.blobs.count * 3), b.blobs.center.slice(0, b.blobs.count * 3))
})

test('stems sway in a draft and stand still without one', () => {
  const b = makeBouquet({ season: 'summer', seed: 5, size: 'bouquet', shape: 'round' }, COARSE)
  const sk = b.skeleton
  const at = (t: number) => { poseBouquet(b, sk, t); return Array.from(sk.matrix.subarray(b.stems[0].head * 16, b.stems[0].head * 16 + 16)) }
  b.draft = 1
  const one = at(1), two = at(2.3)
  assert.ok(one.some((v, i) => Math.abs(v - two[i]) > 1e-4), 'nothing moved')
  assert.deepEqual(at(1), one)
  b.draft = 0
  assert.deepEqual(at(1), at(2.3))
})

test('petals wait on their flowers, fall one at a time and come to rest on the table, not in it', () => {
  const b = makeBouquet({ season: 'spring', seed: 3, size: 'bouquet', shape: 'round' }, COARSE)
  assert.ok(b.falling.length >= 3, `${b.falling.length} loose petals`)
  const sk = b.skeleton
  assert.equal(fallen(b, 100), 0)
  setShedding(b, true, 0)
  const times = b.falling.map((f) => f.at).sort((x, y) => x - y)
  assert.ok(times[0] > 1 && times.every((t, i) => i === 0 || t > times[i - 1]), 'they all go at once')
  setShedding(b, false, 0)
  assert.equal(fallen(b, 1e6), 0)
  assert.equal(shedOne(b, 2), true)
  assert.equal(fallen(b, 2), 1)
  const f = b.falling.find((x) => x.at === 2)!
  // riding its flower before, on its way down after, lying on the table at the end
  poseBouquet(b, sk, 1.9)
  const start = lowestOf(b, f, sk)
  poseBouquet(b, sk, 2 + f.takes * 0.5)
  const mid = lowestOf(b, f, sk)
  poseBouquet(b, sk, 2 + f.takes + 5)
  const end = lowestOf(b, f, sk)
  assert.ok(start > mid && mid > end, `${start} ${mid} ${end}`)
  assert.ok(end > 0 && end < 0.02, `it lies at ${end}`)
  for (let t = 2; t < 2 + f.takes + 1; t += 0.05) { poseBouquet(b, sk, t); assert.ok(lowestOf(b, f, sk) > -0.005, `under the table at ${t}`) }
  // and every one of them, in the end
  while (shedOne(b, 3)) { /* all of them */ }
  assert.equal(shedOne(b, 3), false)
  poseBouquet(b, sk, 60)
  for (const x of b.falling) { const low = lowestOf(b, x, sk); assert.ok(low > 0 && low < 0.02, `one lies at ${low}`) }
})

test('the season follows the month', () => {
  assert.equal(seasonOn(new Date(2026, 3, 10)), 'spring')
  assert.equal(seasonOn(new Date(2026, 6, 1)), 'summer')
  assert.equal(seasonOn(new Date(2026, 10, 19)), 'fall')
  assert.equal(seasonOn(new Date(2026, 0, 5)), 'winter')
  assert.equal(seasonOn(new Date(2026, 11, 25)), 'winter')
})

test('lines read as a florist would say them', () => {
  const p = plan({ season: 'spring', seed: 4, size: 'posy', shape: 'round' })
  for (const l of p.lines) assert.match(inWords(l), /^(one|two|three|four|five) [a-z' -]+$/)
})
