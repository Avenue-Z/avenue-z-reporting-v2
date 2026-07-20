import type { SectionTemplate } from '@/lib/report-sections/types'

// Order MUST match today's hardcoded PR Influence body sequence (dev lines 412-457).
export const PR_INFLUENCE_TEMPLATE: SectionTemplate = {
  order: [
    { id: 'pr-synopsis', version: 1 },
    { id: 'pr-placement-matchback', version: 1 },
    { id: 'sentiment-insights', version: 1 },
    { id: 'editorial-and-clusters', version: 1 },
    { id: 'brand-absent-editorial', version: 1 },
  ],
  labels: {},
  thresholds: {},
}
