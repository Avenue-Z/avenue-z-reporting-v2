import type { PartRegistry } from '@/lib/report-sections/types'
import type { OrganicSocialCtx } from '../../ctx'

/** The Trend graphs PR's kit versions (follower-graph@3, and engagement-trend@3 and @4; docs/superpowers/plans/2026-11-23-os-design-phase1.md, Tasks 3 and 4). Empty until that PR fills it.
 *  Every version here is `published: false`, never replaces an existing version, and has its layout in
 *  `trends.layout.ts`; `slots.test.ts` checks all three. Registered through `../registry.ts`. */
export const KIT_TRENDS_PARTS: PartRegistry<OrganicSocialCtx> = {}
