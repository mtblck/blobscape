import { createRoot } from 'react-dom/client'
import '../shared/theme.css'

const experiments = [
  {
    slug: 'splat-to-sprite',
    title: 'Splat to Sprite',
    blurb:
      'Load a 3D Gaussian splat, frame it like a game camera, and bake it into palette-locked pixel-art sprite sheets for Tinkerkit.',
  },
]

function Hub() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <p className="text-sm uppercase tracking-widest text-ink-faint">
        <a href="https://mattblack.space/" className="hover:text-accent">Matt Black</a> / Experiments
      </p>
      <h1 className="mt-3 font-serif text-5xl">Experiments</h1>
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
  )
}

createRoot(document.getElementById('root')!).render(<Hub />)
