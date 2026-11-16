import { createRoot, hydrateRoot } from 'react-dom/client'
import '../shared/theme.css'
import { App } from './App.tsx'

const root = document.getElementById('root')!
// Pages prerendered from the app itself (data-ssr) are picked up where they stand, so the first paint doesn't move;
// the rest carry a simpler stand-in that the app replaces
if (root.dataset.ssr !== undefined) hydrateRoot(root, <App />, { onRecoverableError: () => { /* a returning visitor's progress differs from the prerender: React redraws the page, which is fine */ } })
else createRoot(root).render(<App />)
