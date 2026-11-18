import type { DetailedHTMLProps, HTMLAttributes } from 'react'
import type { BlobscapeCreature } from '../splat-engine/element.ts'

/** The `<blobscape-creature>` element in JSX: its attributes as the element reads them. */
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'blobscape-creature': DetailedHTMLProps<HTMLAttributes<BlobscapeCreature>, BlobscapeCreature> & {
        src?: string; move?: string; hover?: string; tap?: string; look?: 'pointer'; orbit?: 'none'; azimuth?: number | string
        elevation?: number | string; speed?: number | string; poster?: string; alt?: string; backend?: 'webgl'; offscreen?: string
      }
    }
  }
}
