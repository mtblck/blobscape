import { readProject, type SceneProject } from '../../splat-engine/project.ts'
import { LIBRARY } from './library.ts'
import { slug } from './shown.ts'

/**
 * Where Scene Creator keeps a visitor's scenes (#340): IndexedDB in their own browser, nothing sent anywhere. A shelf
 * holds each saved scene with a small picture, and which one was open last, so the editor reopens on it. Storage can
 * be missing or refused (a private window, cleared site data), so `openShelf` gives nothing then and the page says
 * work will not be kept, offering a file instead. `memoryShelf` is the same shelf in memory, for tests.
 */

/** One scene kept in the browser. Its name is its project's. */
export interface SavedScene {
  id: string
  /** When it last changed, in milliseconds since 1970. */
  updated: number
  project: SceneProject
  /** A small JPEG of the view, as a data address. */
  picture?: string
}

/** The scenes kept, and which was open last. Every call may throw when the browser refuses storage. */
export interface Shelf {
  /** Every scene, the most recently changed first. */
  list(): Promise<SavedScene[]>
  get(id: string): Promise<SavedScene | undefined>
  put(s: SavedScene): Promise<void>
  remove(id: string): Promise<void>
  /** The scene open last, if any. */
  last(): Promise<string | undefined>
  setLast(id: string | undefined): Promise<void>
}

/** The longest a name may be (`checkProject` holds a project to it). */
export const NAME_MOST = 80
/** A project file's end. */
export const FILE_END = '.blobscape.json'
/** How long after the last change the open project is saved. */
export const AUTOSAVE_MS = 600

/** Whether a library id exists, for checking a project. */
export const known = (id: string) => LIBRARY.some((e) => e.id === id)

/** Newest first. */
export const newestFirst = (list: SavedScene[]): SavedScene[] => [...list].sort((a, b) => b.updated - a.updated)

/** A name tidied: spaces closed up, at most `NAME_MOST` letters; undefined when nothing is left. */
export function cleanName(name: string): string | undefined {
  const n = name.replace(/\s+/g, ' ').trim().slice(0, NAME_MOST).trim()
  return n || undefined
}

/** A copy's name: "<name> copy", then "<name> copy 2" and on, never one already `taken`. */
export function copyName(name: string, taken: string[]): string {
  const base = name.replace(/ copy( \d+)?$/, '')
  for (let k = 1; ; k++) {
    const tail = k === 1 ? ' copy' : ` copy ${k}`
    const n = base.slice(0, NAME_MOST - tail.length) + tail
    if (!taken.includes(n)) return n
  }
}

/** A project renamed, or the same project when the name is empty or unchanged. */
export function renamed(p: SceneProject, name: string): SceneProject {
  const n = cleanName(name)
  return !n || n === p.name ? p : { ...p, name: n }
}

/** A project file's name. */
export const fileName = (p: SceneProject) => `${slug(p.name)}${FILE_END}`

/** A project as a file's text. */
export const fileText = (p: SceneProject) => `${JSON.stringify(p, null, 1)}\n`

/** A project file read and checked: the project, or what is wrong with it as `where: what`. */
export const readFile = (text: string) => readProject(text, known)

/** A new id, unique enough for one browser's shelf. */
export function newId(): string {
  const c = globalThis.crypto
  return c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** A shelf in memory: the same rules, gone with the page. */
export function memoryShelf(): Shelf {
  const kept = new Map<string, SavedScene>()
  let lastId: string | undefined
  // copies in and out, as IndexedDB's structured clone makes them
  const copy = <T>(x: T): T => structuredClone(x)
  return {
    list: async () => newestFirst([...kept.values()].map(copy)),
    get: async (id) => { const s = kept.get(id); return s && copy(s) },
    put: async (s) => { kept.set(s.id, copy(s)) },
    remove: async (id) => { kept.delete(id); if (lastId === id) lastId = undefined },
    last: async () => (lastId && kept.has(lastId) ? lastId : undefined),
    setLast: async (id) => { lastId = id },
  }
}

const DB = 'blobscape-scene-creator'
const SCENES = 'scenes'
const META = 'meta'

const done = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
const finished = (t: IDBTransaction) => new Promise<void>((resolve, reject) => { t.oncomplete = () => resolve(); t.onerror = () => reject(t.error); t.onabort = () => reject(t.error) })

/** The browser's shelf, or nothing where IndexedDB is missing or refused. Call it in an effect: the page is prerendered. */
export async function openShelf(idb: IDBFactory | undefined = globalThis.indexedDB): Promise<Shelf | undefined> {
  if (!idb) return undefined
  let db: IDBDatabase
  try {
    const req = idb.open(DB, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(SCENES, { keyPath: 'id' })
      req.result.createObjectStore(META)
    }
    db = await done(req)
    // a private window may open the database and refuse the first write: try one
    const t = db.transaction(META, 'readwrite')
    t.objectStore(META).put(Date.now(), 'opened')
    await finished(t)
  } catch (e) {
    console.warn('Scene Creator storage is unavailable', e)
    return undefined
  }
  const write = async (store: string, act: (s: IDBObjectStore) => void) => {
    const t = db.transaction(store, 'readwrite')
    act(t.objectStore(store))
    await finished(t)
  }
  const read = <T>(store: string, ask: (s: IDBObjectStore) => IDBRequest<T>) => done(ask(db.transaction(store, 'readonly').objectStore(store)))
  const shelf: Shelf = {
    list: async () => newestFirst(await read<SavedScene[]>(SCENES, (s) => s.getAll())),
    get: (id) => read<SavedScene | undefined>(SCENES, (s) => s.get(id)),
    put: (s) => write(SCENES, (st) => st.put(s)),
    remove: async (id) => {
      await write(SCENES, (st) => st.delete(id))
      if ((await shelf.last()) === id) await shelf.setLast(undefined)
    },
    last: async () => {
      const id = await read<string | undefined>(META, (s) => s.get('last'))
      return id && (await shelf.get(id)) ? id : undefined
    },
    setLast: (id) => write(META, (st) => (id ? st.put(id, 'last') : st.delete('last'))),
  }
  return shelf
}

/**
 * Settings read back from a file or the shelf onto a start: each key of `start` taken from `x` only where it is the
 * same kind of value (a number that is finite), so an old or edited file can't put anything odd into the page.
 */
export function mergedLike<T extends object>(start: T, x: unknown): T {
  if (!x || typeof x !== 'object') return start
  const out = { ...start } as Record<string, unknown>
  for (const [k, v] of Object.entries(start)) {
    const got = (x as Record<string, unknown>)[k]
    if (typeof got === typeof v && (typeof got !== 'number' || Number.isFinite(got)) && (typeof got !== 'object' || got === null)) out[k] = got
  }
  return out as T
}
