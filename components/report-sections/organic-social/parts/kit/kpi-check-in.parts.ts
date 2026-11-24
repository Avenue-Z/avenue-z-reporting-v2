import type { PartRegistry } from '@/lib/report-sections/types'
import type { OrganicSocialCtx } from '../../ctx'
import { kpiCheckInV2 } from '../kpi-kit'

/** The KPI Check-In PR's kit version (kpi-check-in@2; docs/superpowers/plans/2026-11-23-os-design-phase1.md, Task 9).
 *  Every version here is `published: false`, never replaces an existing version, and has its layout in
 *  `kpi-check-in.layout.ts`; `slots.test.ts` checks all three. Registered through `../registry.ts`. */
export const KIT_KPI_CHECK_IN_PARTS: PartRegistry<OrganicSocialCtx> = {
  'kpi-check-in': { 2: kpiCheckInV2 },
}
