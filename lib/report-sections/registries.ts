import type { PartRegistry } from './types'
import { mergeRegistries } from './registry'
import { PEEC_PARTS } from '@/components/report-sections/peec-ai/parts/registry'
import { BESPOKE_PARTS } from '@/components/report-sections/peec-ai/parts/bespoke/registry'
import { PR_INFLUENCE_PARTS } from '@/components/report-sections/peec-ai/pr-influence/parts/registry'

export const REGISTRIES: Record<string, PartRegistry<unknown>> = {
  'peec-ai': mergeRegistries(PEEC_PARTS, BESPOKE_PARTS) as unknown as PartRegistry<unknown>,
  'peec-ai:pr-influence': PR_INFLUENCE_PARTS as unknown as PartRegistry<unknown>,
}
