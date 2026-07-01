import type { PartRegistry } from './types'
import { mergeRegistries } from './registry'
import { PEEC_PARTS } from '@/components/report-sections/peec-ai/parts/registry'
import { BESPOKE_PARTS } from '@/components/report-sections/peec-ai/parts/bespoke/registry'

export const REGISTRIES: Record<string, PartRegistry<unknown>> = {
  'peec-ai': mergeRegistries(PEEC_PARTS, BESPOKE_PARTS) as unknown as PartRegistry<unknown>,
}
