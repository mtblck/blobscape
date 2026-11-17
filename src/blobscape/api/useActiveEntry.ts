import { useEffect, useRef, useState } from 'react'

/** How far down the window an entry's top must pass to count as the one being read. */
const READING_LINE = 0.3
/** How far you can scroll from a picked entry before reading position takes over again. */
const PICK_SLACK = 48

/** The entry named in the address's hash, or '' when there's none or it isn't valid percent-encoding. */
export function hashId(): string {
  try { return decodeURIComponent(window.location.hash.slice(1)) } catch { return '' }
}

type Held = { landed: number | null }

/**
 * Which entry is current: the one picked from the contents, or else the one being read (the last whose top has
 * passed 30% down the window, and the last of all once the page is scrolled to its end). A pick holds while the
 * page scrolls to it and while you stay near where it landed: entries near the end can't scroll to the top, so the
 * reading line alone would name the wrong one. The same way of working as the tipjar docs.
 *
 * `ids` are the entries' element ids in page order. Nothing is read until the page is in the browser, so the
 * prerendered page and the hydrated one start the same.
 */
export function useActiveEntry(ids: string[]): [string, (id: string) => void] {
  const [active, setActive] = useState('')
  const pick = useRef<Held | null>(null)

  const hold = () => {
    const held: Held = { landed: null }
    pick.current = held
    // one that needs no scrolling (it's already in place) lands after a second
    setTimeout(() => { if (held.landed === null) held.landed = window.scrollY }, 1000)
  }

  useEffect(() => {
    if (!ids.length) return
    let settle = 0
    let frame = 0
    const reading = () => {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) return ids[ids.length - 1]
      const line = window.innerHeight * READING_LINE
      let current = ''
      for (const id of ids) {
        const top = document.getElementById(id)?.getBoundingClientRect().top
        if (top !== undefined && top <= line) current = id
      }
      return current
    }
    const read = () => {
      frame = 0
      const held = pick.current
      if (held) {
        // still traveling to the pick: wait until the scrolling stops, then note where it landed
        if (held.landed === null) {
          window.clearTimeout(settle)
          settle = window.setTimeout(() => { held.landed = window.scrollY }, 150)
          return
        }
        if (Math.abs(window.scrollY - held.landed) < PICK_SLACK) return
        pick.current = null
      }
      setActive(reading())
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(read) }
    // a hash already in the address is a pick too
    const hash = hashId()
    if (hash && ids.includes(hash)) { hold(); setActive(hash) } else read()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.clearTimeout(settle)
      cancelAnimationFrame(frame)
    }
  }, [ids])

  return [active, (id) => { hold(); setActive(id) }]
}
