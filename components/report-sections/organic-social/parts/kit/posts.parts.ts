import type { PartRegistry } from '@/lib/report-sections/types'
import type { OrganicSocialCtx } from '../../ctx'
import { influencerPostsV2, topContentV4, topContentV5 } from '../posts-kit'

/** The Posts PR's kit versions (top-content@4 and @5, and influencer-posts@2;
 *  docs/superpowers/plans/2026-11-23-os-design-phase1.md, Tasks 7 and 8).
 *  Every version here is `published: false`, never replaces an existing version, and has its layout in
 *  `posts.layout.ts`; `slots.test.ts` checks all three. Registered through `../registry.ts`. */
export const KIT_POSTS_PARTS: PartRegistry<OrganicSocialCtx> = {
  'top-content': { 4: topContentV4, 5: topContentV5 },
  'influencer-posts': { 2: influencerPostsV2 },
}
