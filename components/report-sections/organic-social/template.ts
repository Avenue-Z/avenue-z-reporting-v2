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

// Platform subpages: Overview's composition plus the Follower Graph as the second part (Spec 1
// §6 — platform-only, never on Overview). No section_templates DB row is written here; seeding
// is M4. CODE_TEMPLATES maps both keys.
export const ORGANIC_SOCIAL_PLATFORM_TEMPLATE: SectionTemplate = {
  order: [
    { id: 'platform-headlines', version: 1 },
    { id: 'follower-graph', version: 1 },
    { id: 'engagement-trend', version: 1 },
    { id: 'top-content', version: 2 },
  ],
  labels: {},
  thresholds: {},
}

/** First-boot fallback used before the section_templates rows are seeded (M4) and in tests with no DB. */
export const CODE_TEMPLATES: Record<string, SectionTemplate> = {
  'organic-social': ORGANIC_SOCIAL_TEMPLATE,
  'organic-social:platform': ORGANIC_SOCIAL_PLATFORM_TEMPLATE,
}
