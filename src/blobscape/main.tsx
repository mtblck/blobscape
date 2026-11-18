import { createRoot, hydrateRoot } from 'react-dom/client'
import '../shared/theme.css'
import { App } from './App.tsx'
import { watchStale } from '../shared/stale.tsx'

watchStale()
const root = document.getElementById('root')!
// Pages prerendered from the app itself (data-ssr) are picked up where they stand, so the first paint doesn't move;
// the rest (lessons and experiments, which read the address and saved progress as they start) are prerendered from the
// app too but drawn afresh over it: the same page, so nothing moves, and no stale prerendered value can stay
if (root.dataset.ssr !== undefined) hydrateRoot(root, <App />, { onRecoverableError: () => { /* a returning visitor's progress differs from the prerender: React redraws the page, which is fine */ } })
else createRoot(root).render(<App />)
