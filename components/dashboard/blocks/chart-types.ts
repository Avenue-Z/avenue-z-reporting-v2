import type { Granularity } from '@/lib/dashboard/types'

export interface BarChartInput {
  data: { dim: string; value: number; prevValue?: number }[]
  hasCompare: boolean
  target?: number
  ceiling?: number
}

export interface LineChartInput {
  data: { bucket: string; bucketLabel: string; value: number; prevValue?: number }[]
  hasCompare: boolean
  granularity: Granularity
}
