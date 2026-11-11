import { createRoot } from 'react-dom/client'
import '../shared/theme.css'
import { SiteHeader } from '../shared/SiteHeader.tsx'

const experiments = [
  {
    slug: 'splat-to-sprite',
    title: 'Splat to Sprite',
    blurb:
      'Load a 3D Gaussian splat, frame it like a game camera, and bake it into palette-locked pixel-art sprite sheets for Tinkerkit.',
  },
  {
    slug: 'fit-a-picture',
    title: 'Fit a Picture',
    blurb:
      'Watch a few hundred 2D Gaussians start as noise and learn to paint a picture, using the training loop behind every splat capture.',
  },
  {
    slug: 'blobscape',
    title: 'Blobscape',
    blurb:
      'Learn what a splat is made of, one blob at a time, then spray, select and pick apart thousands of them in a sandbox.',
  },
]

function Hub() {
  return (
    <div className="min-h-dvh">
      <SiteHeader hub />
      <main id="main" className="mx-auto max-w-2xl px-4 py-14">
        <h1 className="font-serif text-5xl">Experiments</h1>
        <p className="mt-4 font-serif text-xl text-ink-muted">Small things to poke at while learning how they work.</p>
        <ul className="mt-10 space-y-6">
          {experiments.map((e) => (
            <li key={e.slug} className="border-t border-rule pt-6">
              <a href={`/experiments/${e.slug}/`} className="group block">
                <h2 className="font-serif text-2xl group-hover:text-accent">{e.title} →</h2>
                <p className="mt-1 text-ink-muted">{e.blurb}</p>
              </a>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Hub />)
