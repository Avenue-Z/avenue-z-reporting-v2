import type { PartRegistry } from '@/lib/report-sections/types'
import type { OrganicSocialCtx } from '../../ctx'

/** The Year to date PR's kit versions (ytd-review@5; docs/superpowers/plans/2026-11-23-os-design-phase1.md, Task 6). Empty until that PR fills it.
 *  Every version here is `published: false`, never replaces an existing version, and has its layout in
 *  `ytd.layout.ts`; `slots.test.ts` checks all three. Registered through `../registry.ts`. */
export const KIT_YTD_PARTS: PartRegistry<OrganicSocialCtx> = {}
