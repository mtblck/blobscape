import { readProject, type SceneProject } from '../../splat-engine/project.ts'
import { isModel } from './models.ts'
import { known } from './store.ts'

/**
 * A scene as a link (#386): a project with no models of your own in it, packed into the part of the
 * address after `#`. A browser never sends that part to a server, so a shared scene is held by the link alone and
 * the site still stores nothing. JSON, numbers cut to `DIGITS` places, deflated and written in base64url.
 */

/** What the part after `#` starts with. */
export const LINK_KEY = 'shared='
/** Decimal places kept on every number: a thousandth of a meter or a degree is more than anyone can see. */
export const DIGITS = 3
/** The longest link given out: past this some chat apps and browsers cut an address short. */
export const LINK_MOST = 8000

/**
 * Why a project can't be a link, or undefined when it can: a model of your own is a file the link can't hold. A prop
 * written out as a description (the windmill's second haystack, a scene you opened) can go, if the link stays short.
 */
export function whyNoLink(p: SceneProject): string | undefined {
  const own = (ref: SceneProject['land']) => typeof ref === 'string' && isModel(ref)
  if (own(p.land)) return 'Its land is your own, which only a file can carry.'
  if (p.props.some((x) => own(x.prop))) return 'It has props of your own, which only a file can carry.'
  return undefined
}

const rounded = (_: string, v: unknown) => (typeof v === 'number' && !Number.isInteger(v) ? Number(v.toFixed(DIGITS)) : v)

async function through(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream))
  return new Uint8Array(await out.arrayBuffer())
}

const toBase64Url = (bytes: Uint8Array) => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromBase64Url = (text: string) => {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/** The part after `#` that holds the project, or why it can't (`whyNoLink`, or too long). */
export async function linkFor(p: SceneProject): Promise<{ hash?: string; why?: string }> {
  const why = whyNoLink(p)
  if (why) return { why }
  const packed = await through(new TextEncoder().encode(JSON.stringify(p, rounded)), new CompressionStream('deflate-raw'))
  const hash = `#${LINK_KEY}${toBase64Url(packed)}`
  return hash.length > LINK_MOST ? { why: 'It is too big for a link: save it as a file instead.' } : { hash }
}

/** Whether an address's part after `#` holds a shared scene. */
export const isLink = (hash: string) => hash.replace(/^#/, '').startsWith(LINK_KEY)

/** A link's project read and checked, or what is wrong with it as `where: what`. */
export async function readLink(hash: string): Promise<{ project?: SceneProject; problems: string[] }> {
  const body = hash.replace(/^#/, '')
  if (!body.startsWith(LINK_KEY)) return { problems: ['link: not a shared scene'] }
  const data = body.slice(LINK_KEY.length)
  if (data.length > LINK_MOST || !/^[\w-]*$/.test(data)) return { problems: ['link: not a shared scene'] }
  let text: string
  try { text = new TextDecoder().decode(await through(fromBase64Url(data), new DecompressionStream('deflate-raw'))) } catch { return { problems: ['link: cut short or changed, so it cannot be read'] } }
  const read = readProject(text, known)
  if (!read.project) return read
  const why = whyNoLink(read.project)
  return why ? { problems: [`link: ${why}`] } : read
}
