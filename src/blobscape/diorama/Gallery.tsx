import { LOOP_SIZE, LOOPS, loopSrc } from './loops.ts'

/** One recorded loop, scaled up with no smoothing; anyone who asks for less motion gets its first frame. */
export function Loop({ id }: { id: string }) {
  return (
    <picture>
      <source media="(prefers-reduced-motion: reduce)" srcSet={loopSrc(id, true)} />
      <img
        src={loopSrc(id)}
        alt=""
        width={LOOP_SIZE.width}
        height={LOOP_SIZE.height}
        loading="lazy"
        decoding="async"
        className="block aspect-[410/307] h-auto w-full case rounded-xl bg-paper ring-1 ring-rule [image-rendering:pixelated]"
      />
    </picture>
  )
}

const NAME = 'font-display text-lg text-ink no-underline after:absolute after:inset-0 after:rounded-2xl hover:text-accent focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent'
const TILE = 'relative flex flex-col gap-2 rounded-2xl border bg-paper p-2.5 transition-colors hover:border-ink-faint'

/**
 * The scenes as recorded loops. With `onPick` each one is a button that opens
 * it in the view above (Pixel Diorama); without, a link to Pixel Diorama with
 * that scene. `ids` picks some, in that order.
 */
export function Gallery({ ids, onPick, current, testId }: { ids?: readonly string[]; onPick?: (id: string) => void; current?: string; testId?: string }) {
  const loops = ids ? ids.map((id) => LOOPS.find((l) => l.id === id)!).filter(Boolean) : LOOPS
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3" data-testid={testId}>
      {loops.map((l) => (
        <li key={l.id} className={`${TILE} ${current === l.id ? 'border-accent' : 'border-rule'}`}>
          <Loop id={l.id} />
          {onPick ? (
            <button type="button" aria-label={`${l.label}, open in the view above`} aria-pressed={current === l.id} onClick={() => onPick(l.id)} className={`${NAME} cursor-pointer px-1 text-left`}>
              {l.label}
            </button>
          ) : (
            <a href={`/experiments/pixel-diorama/${l.id === LOOPS[0].id ? '' : `?scene=${l.id}`}`} className={`${NAME} px-1`}>{l.label}</a>
          )}
        </li>
      ))}
    </ul>
  )
}
