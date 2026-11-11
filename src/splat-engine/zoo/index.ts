import { DRAGON } from './dragon.ts'
import { ELF } from './elf.ts'
import { FOX } from './fox.ts'
import { FROG } from './frog.ts'
import type { Species } from './species.ts'

export type { Move, Species } from './species.ts'

/** Every creature on the Creature page, simplest first. */
export const ZOO: Species[] = [FROG, FOX, ELF, DRAGON]
