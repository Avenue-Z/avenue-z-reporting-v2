import type { PartRegistry } from '@/lib/report-sections/types'
import type { OrganicSocialCtx } from '../../ctx'
import { engagementTrendV3, engagementTrendV4, followerGraphV3 } from '../trends-kit'

/** The Trend graphs PR's kit versions (follower-graph@3, and engagement-trend@3 and @4;
 *  docs/superpowers/plans/2026-11-23-os-design-phase1.md, Tasks 3 and 4).
 *  Every version here is `published: false`, never replaces an existing version, and has its layout in
 *  `trends.layout.ts`; `slots.test.ts` checks all three. Registered through `../registry.ts`. */
export const KIT_TRENDS_PARTS: PartRegistry<OrganicSocialCtx> = {
  'follower-graph': { 3: followerGraphV3 },
  'engagement-trend': { 3: engagementTrendV3, 4: engagementTrendV4 },
}
