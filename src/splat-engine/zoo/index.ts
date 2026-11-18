import { DRAGON } from './dragon.ts'
import { ELF } from './elf.ts'
import { FOX, MINIMALIST_FOX } from './fox.ts'
import { FROG } from './frog.ts'
import type { Species } from './species.ts'

export type { Move, Species } from './species.ts'

/** Every creature on the Creature page, simplest first, with the first fox beside the one that took its place. */
export const ZOO: Species[] = [FROG, FOX, MINIMALIST_FOX, ELF, DRAGON]
