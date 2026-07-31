import { describe, expect, test } from 'vitest'
import { REGISTRIES } from './registries'
import { parseSectionTemplate } from './validate'
import type { SectionTemplate } from './types'
import { PEEC_TEMPLATE } from '@/components/report-sections/peec-ai/template'
import {
  ORGANIC_SOCIAL_TEMPLATE,
  ORGANIC_SOCIAL_PLATFORM_TEMPLATE,
} from '@/components/report-sections/organic-social/template'

// The CI home for the seed script's parse-before-insert guard. `scripts/seed-section-templates.ts`
// validates each SEED template against REGISTRIES[slug] before it writes, but that guard only fires
// when a human runs the script — `scripts/**` is excluded from vitest, and the script can't be
// imported here (it pulls in @/lib/db/client, which throws without DATABASE_URL). So this test
// re-declares the same slug→template mapping and runs the same parse. It goes red the moment a code
// template pins a part that has been removed or unpublished — surfacing in CI what would otherwise
// only surface at the gated manual seed (Spec 1 §10 recovery is manual SQL). Keep this list in sync
// with SEED in scripts/seed-section-templates.ts.
const SEED: { slug: string; template: SectionTemplate }[] = [
  { slug: 'peec-ai', template: PEEC_TEMPLATE },
  { slug: 'organic-social', template: ORGANIC_SOCIAL_TEMPLATE },
  { slug: 'organic-social:platform', template: ORGANIC_SOCIAL_PLATFORM_TEMPLATE },
]

describe('seed section_templates code constants', () => {
  test.each(SEED)('$slug parses against its registry (every pin known + published)', ({ slug, template }) => {
    const reg = REGISTRIES[slug]
    expect(reg, `no registry registered for '${slug}'`).toBeDefined()
    expect(() => parseSectionTemplate(template, reg)).not.toThrow()
  })

  // REGISTRIES['organic-social'] and ['organic-social:platform'] are the SAME ORGANIC_SOCIAL_PARTS
  // object, so parse-before-insert can't enforce the Overview/platform split: a template that wrongly
  // put follower-graph on Overview would still parse clean. Spec 1 §6 makes follower-graph
  // platform-only — assert that separation directly, since the parser structurally can't.
  test('Overview template excludes the platform-only follower-graph (Spec 1 §6)', () => {
    expect(ORGANIC_SOCIAL_TEMPLATE.order.map((p) => p.id)).not.toContain('follower-graph')
  })

  test('platform template includes follower-graph', () => {
    expect(ORGANIC_SOCIAL_PLATFORM_TEMPLATE.order.map((p) => p.id)).toContain('follower-graph')
  })
})
