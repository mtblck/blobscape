import type { Skeleton } from '../rig.ts'
import { Swing } from '../swing.ts'
import { ELF_SWING } from './elf.ts'

/**
 * The elf's cloak and plait as cloth (issue #161), swinging on `ELF_SWING`:
 * pinned where the body carries each top and pulled loosely toward where the
 * move puts the rest, so they swing and lag when the elf turns or stops, then
 * cleared of the legs with `clearCloak`.
 *
 *   const cloth = new ElfCloth(sk)        // once
 *   ...pose the move, place the elf...
 *   cloth.update(sk, dt)                  // turns the cloak and hair bones
 */
export class ElfCloth extends Swing {
  constructor(sk: Skeleton) { super(sk, ELF_SWING) }
}
