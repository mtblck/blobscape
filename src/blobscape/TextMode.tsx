import { DrawnPage } from './BrushInk.tsx'

/**
 * Text Mode (Matt, 2026-11-23: ASCII out of Brush and Ink, with more text-related looks): the same subjects drawn as
 * characters, in any of the sets the engine's character pass knows: the Text style's (ASCII, braille, words, typewriter) and Box
 * Art's (box drawing, quarter blocks; Matt split them, 2026-11-25), which Diorama and Scene Creator have too.
 */
export function TextMode() {
  return (
    <DrawnPage
      def={{
        title: 'Text Mode',
        intro: 'The same blobs, read off as text: a grid of characters over the view, each picked by what lies under it. Pick Text (ASCII, braille, your own words or a typewriter) or Box Art (box drawing or quarter blocks), turn the view, and copy the picture as plain text.',
        looks: ['ascii', 'boxart'],
        hook: '__text',
        how: <TextHow />,
      }}
    />
  )
}

function TextHow() {
  return (
    <section aria-labelledby="how-title" className="mt-14 border-t border-rule pt-10 lg:grid lg:grid-cols-12 lg:gap-x-5 lg:pt-14">
      <div className="lg:col-span-5">
        <p className="text-sm text-ink-faint">How it reads</p>
        <h2 id="how-title" className="mt-1 max-w-[16ch] font-display text-4xl leading-[1.05] text-balance sm:text-5xl">A character for every cell</h2>
      </div>
      <div className="mt-8 max-w-[36em] space-y-4 text-lg leading-relaxed text-ink-muted lg:col-span-7 lg:mt-0 lg:text-xl">
        <p>
          Characters only read standing upright in rows, so they can't turn with the blobs the way brush marks do. The view is
          cut into a grid of cells that stays put on the screen, and every frame each cell is given a character for what lies
          under it: how much there is to show, and whether an edge runs through it (the picture ends, one thing stands in front of
          another, two parts meet).
        </p>
        <p>
          Text is ASCII, braille, your own words or a typewriter. ASCII picks the character whose ink matches the cell, and gives
          an edge a stroke along it: | _ / or \. A cell full of fur or grass gets a stroke the way the strands run. Braille splits
          a cell into eight dots, so shapes come out finer than a whole character.
          Words writes your text along every row without a break and lets the picture show through how bright each letter is.
          The typewriter strikes a key, or two over one another for the darkest places, each strike a pixel out of line here and
          there and the ribbon worn unevenly, the same way every time.
        </p>
        <p>
          Box Art draws in box-drawing characters or quarter blocks. Quarter blocks split a cell into quarters, with the shades
          ░ ▒ ▓ where it is even. Box drawing keeps only the edges. Each cell looks at its four corners, and an arm runs between any two that are on
          different sides of an edge, so the arms meet up from cell to cell as ─ │ ┌ ┼ and the rest, like a diagram of the scene.
        </p>
        <p>
          A cell keeps its character until another is clearly a better fit, so the text doesn't flicker as the view turns. Copy
          as text gives you the picture in plain characters, ready to paste.
        </p>
      </div>
    </section>
  )
}
