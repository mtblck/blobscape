import { createContext } from 'react'

/**
 * The engine package's API, as tools/api-docs/build.mjs reads it with TypeDoc from the package's type declarations
 * (src/blobscape/engineApi.json).
 */
export interface ApiSignature { code: string; params?: { name: string; type: string; doc: string }[]; returns?: { type: string; doc: string } }
export interface ApiProp { name: string; type: string; doc: string; optional?: boolean; readonly?: boolean; static?: boolean }
export interface ApiMethod { name: string; doc: string; signatures: ApiSignature[]; optional?: boolean; static?: boolean }
export interface ApiEntry {
  name: string
  kind: 'function' | 'const' | 'class' | 'interface' | 'type' | 'enum' | 'alias'
  doc: string
  /** A function's ways to be called. */
  signatures?: ApiSignature[]
  /** A class's constructor. */
  ctor?: ApiSignature[]
  generics?: string
  extends?: string[]
  props?: ApiProp[]
  methods?: ApiMethod[]
  /** A type's or a value's type. */
  type?: string
  /** For a second name of an export, the first. */
  of?: string
}
export interface ApiModule { id: string; title: string; doc: string; entries: ApiEntry[] }
export interface Api { modules: ApiModule[] }

/** The docs page's words, shared with the prerender. */
export const API_PAGE = {
  crumb: 'Docs',
  title: 'Engine docs',
  description: 'How to use the @blobscape/engine package, and every name it exports with its type and what it does, generated with TypeDoc from the package’s own doc comments: Stage, SplatWorld, bones and skins, posing, cloth, morphs, shapes and sculpting, scenes written as data, pixel mode, rigged .glb files and the zoo.',
} as const

/** The id of the JSON the prerendered page carries, so the page needn't load it again. */
export const API_DATA_ID = 'engine-api-data'

/** The reference, when the page is drawn on the server (ssr.tsx); in the browser it comes from the page or is loaded. */
export const ApiContext = createContext<Api | undefined>(undefined)

/** A module's section on the page. Its own prefix, because a module and a function can share a name (`mix`, `grow`). */
export const sectionId = (moduleId: string) => `about-${moduleId}`
