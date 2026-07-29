import type { SectionTemplate } from '@/lib/report-sections/types'

// Overview: order MUST match today's index.tsx sequence so the migration reproduces the report.
export const ORGANIC_SOCIAL_TEMPLATE: SectionTemplate = {
  order: [
    { id: 'platform-headlines', version: 1 },
    { id: 'engagement-trend', version: 1 },
    { id: 'top-content', version: 2 },
  ],
  labels: {},
  thresholds: {},
}

// Platform subpages share ONE composition, byte-identical to Overview until M3 inserts the
// follower-graph part as the second entry. Aliased (not copy-pasted) so the two can't silently
// drift before M3 differentiates them (PR #168 review R2 #3). The alias carries top-content@2.
export const ORGANIC_SOCIAL_PLATFORM_TEMPLATE: SectionTemplate = ORGANIC_SOCIAL_TEMPLATE

/** First-boot fallback used before the section_templates rows are seeded (M4) and in tests with no DB. */
export const CODE_TEMPLATES: Record<string, SectionTemplate> = {
  'organic-social': ORGANIC_SOCIAL_TEMPLATE,
  'organic-social:platform': ORGANIC_SOCIAL_PLATFORM_TEMPLATE,
}
