import { expect, test } from 'vitest'
import { buildOrganicSocialCtx } from './ctx'
import { CODE_TEMPLATES } from './template'
import { REGISTRIES } from '@/lib/report-sections/registries'

test('the context carries the view, null by default', () => {
  expect(buildOrganicSocialCtx({ clientSlug: 'c', channel: null }).view).toBeNull()
  expect(buildOrganicSocialCtx({ clientSlug: 'c', channel: null, view: 'influencer' }).view).toBe('influencer')
})

test('the Influencer composition is one part, registered for validation', () => {
  expect(CODE_TEMPLATES['organic-social:influencer']).toEqual({ order: [{ id: 'influencer-posts', version: 1 }], labels: {}, thresholds: {} })
  expect(REGISTRIES['organic-social:influencer']).toBe(REGISTRIES['organic-social'])
})
