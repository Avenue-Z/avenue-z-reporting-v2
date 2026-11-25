import type { PartRegistry } from '@/lib/report-sections/types'
import type { OrganicSocialCtx } from '../../ctx'
import { engagementBreakdownV2, platformHeadlinesV4, platformHeadlinesV5, platformHeadlinesV6 } from '../tiles-kit'

/** The Tiles PR's kit versions (platform-headlines@4, @5 and @6, and engagement-breakdown@2;
 *  docs/superpowers/plans/2026-11-23-os-design-phase1.md, Task 2 and Task 5).
 *  Every version here is `published: false`, never replaces an existing version, and has its layout in
 *  `tiles.layout.ts`; `slots.test.ts` checks all three. Registered through `../registry.ts`. */
export const KIT_TILES_PARTS: PartRegistry<OrganicSocialCtx> = {
  'platform-headlines': { 4: platformHeadlinesV4, 5: platformHeadlinesV5, 6: platformHeadlinesV6 },
  'engagement-breakdown': { 2: engagementBreakdownV2 },
}
