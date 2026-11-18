/** Day and Night's words for numbers: the time on a clock, a compass point, an hour from the address. Pure and tested. */

/** "7:35 pm" for an hour of the day (0 to 24, any number wraps), to the nearest five minutes. */
export function clockLabel(hour: number): string {
  const minutes = ((Math.round((hour * 60) / 5) * 5) % 1440 + 1440) % 1440
  const h = Math.floor(minutes / 60), m = minutes % 60
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}

const POINTS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']
/** The compass point a direction lies toward (+x east, +z south): 'southwest'. */
export function compass(way: readonly number[]): string {
  const bearing = (Math.atan2(way[0], -way[2]) * 180) / Math.PI
  return POINTS[((Math.round(bearing / 45) % 8) + 8) % 8]
}

/** An hour from the address (`?hour=19.5`): a number from 0 to 24, or nothing if it isn't one. */
export function hourFrom(text: string | null): number | undefined {
  if (text === null || text.trim() === '') return
  const h = Number(text)
  return Number.isFinite(h) && h >= 0 && h <= 24 ? h % 24 : undefined
}
