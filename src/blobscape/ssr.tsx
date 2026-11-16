import { renderToString } from 'react-dom/server'
import { App } from './App.tsx'
import type { Route } from './routes.ts'

/**
 * A page's HTML as the app itself first draws it, for scripts/prerender.ts. The
 * app then replaces it with the same markup, so the first paint doesn't jump.
 * Only pages that draw nothing in WebGL on their first frame are rendered this way.
 */
export function renderPage(route: Route): string {
  return renderToString(<App route={route} />)
}
