import type { Granularity } from '@/lib/dashboard/types'

export interface LineChartInput {
  data: { bucket: string; bucketLabel: string; value: number; prevValue?: number }[]
  hasCompare: boolean
  granularity: Granularity
}

export interface CapsuleBarInput {
  rows: { name: string; key: string; value: number; pct: number; prior?: number }[]
  hasCompare: boolean
  dimKey: string
}
