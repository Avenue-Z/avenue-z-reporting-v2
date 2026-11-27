// Provider-neutral shapes for the AEO Overview v2 sections. Slices 3 and 5 add theirs here.
import type { DailyPoint } from '@/lib/aeo/types'

export type AeoV2Provider = 'peec' | 'profound'
export type CompareMode = 'previous_period' | 'previous_year'
export type UsedAsSourceBasis = 'answers' | 'citations'

/** One brand in the section 02 table. Percent values are 0-100; a prior is null when the brand had no row in the comparison window. */
export type BrandRowV2 = {
  name: string
  isYou: boolean
  rank: number
  visibility: number
  visibilityPrior: number | null
  sov: number
  sovPrior: number | null
  usedAsSource: number | null
  usedAsSourcePrior: number | null
}

export type BrandTrend = { name: string; isYou: boolean; points: DailyPoint[] }

export type VisibilityV2 = {
  /** Every tracked brand name; drives colors. */
  roster: string[]
  /** Sorted by visibility desc, rank 1..n. */
  brands: BrandRowV2[]
  /** Every brand with at least one point. */
  trend: BrandTrend[]
  usedAsSourceBasis: UsedAsSourceBasis
}
