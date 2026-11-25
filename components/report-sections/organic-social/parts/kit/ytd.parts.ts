import type { PartRegistry } from '@/lib/report-sections/types'
import type { OrganicSocialCtx } from '../../ctx'
import { ytdReviewV5 } from '../ytd-kit'

/** The Year to date PR's kit version (ytd-review@5; docs/superpowers/plans/2026-11-23-os-design-phase1.md, Task 6).
 *  Every version here is `published: false`, never replaces an existing version, and has its layout in
 *  `ytd.layout.ts`; `slots.test.ts` checks all three. Registered through `../registry.ts`. */
export const KIT_YTD_PARTS: PartRegistry<OrganicSocialCtx> = {
  'ytd-review': { 5: ytdReviewV5 },
}
