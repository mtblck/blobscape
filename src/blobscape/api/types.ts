import { createContext } from 'react'

/** The engine package's API, as scripts/engine-api.mjs reads it from the type declarations (src/blobscape/engineApi.json). */
export interface ApiEntry { name: string; kind: 'function' | 'const' | 'class' | 'interface' | 'type' | 'enum'; doc: string; code: string }
export interface ApiModule { id: string; title: string; doc: string; entries: ApiEntry[] }
export interface Api { modules: ApiModule[] }

/** The reference page's words, shared with the prerender. */
export const API_PAGE = {
  crumb: 'API reference',
  title: 'The engine’s API',
  description: 'Every name the @blobscape/engine package exports, with its type and what it does, read from the package’s own declarations: Stage, SplatWorld, bones and skins, posing, cloth, morphs, shapes and sculpting, scenes written as data, pixel mode, rigged .glb files and the zoo.',
} as const

/** The id of the JSON the prerendered page carries, so the page needn't load it again. */
export const API_DATA_ID = 'engine-api-data'

/** The reference, when the page is drawn on the server (ssr.tsx); in the browser it comes from the page or is loaded. */
export const ApiContext = createContext<Api | undefined>(undefined)
