import { renderToString } from 'react-dom/server'
import { App } from './App.tsx'
import type { Route } from './routes.ts'
import { ApiContext, type Api } from './api/types.ts'
import api from './engineApi.json'

/**
 * A page's HTML as the app itself first draws it, for scripts/prerender.ts. The
 * app then replaces it with the same markup, so the first paint doesn't jump.
 * Only pages that draw nothing in WebGL on their first frame are rendered this way.
 */
export function renderPage(route: Route): string {
  // the API reference's data is handed in here, so the browser bundle needn't carry it
  return renderToString(<ApiContext.Provider value={api as Api}><App route={route} /></ApiContext.Provider>)
}
