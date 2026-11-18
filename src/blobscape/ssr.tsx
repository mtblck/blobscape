import { renderToString } from 'react-dom/server'
import { App } from './App.tsx'
import { href, type Route } from './routes.ts'
import { ApiContext, type Api } from './api/types.ts'
import api from './engineApi.json'

/**
 * A page's HTML as the app itself first draws it, for scripts/prerender.ts. The
 * app then picks it up or replaces it with the same markup, so the first paint
 * doesn't jump. A page that draws in WebGL comes out with its view empty and its
 * loading mark showing, which is how it starts in the browser too.
 */
export function renderPage(route: Route): string {
  // Pages read their options from the address while rendering (?scene=, ?offscreen=1): here there is none,
  // so they see a plain address and draw their defaults. Only for the length of this render.
  const g = globalThis as { location?: unknown }
  const had = 'location' in g
  if (!had) g.location = { search: '', hash: '', pathname: href(route), href: href(route) }
  try {
    // the API reference's data is handed in here, so the browser bundle needn't carry it
    return renderToString(<ApiContext.Provider value={api as Api}><App route={route} /></ApiContext.Provider>)
  } finally {
    if (!had) delete g.location
  }
}
