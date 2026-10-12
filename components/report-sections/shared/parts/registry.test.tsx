import { expect, test, vi } from 'vitest'
vi.mock('@/components/report-sections/commentary', () => ({ CommentarySection: () => null }))
import { recommendationsPart } from './registry'

// Jasmine's 10/9 feedback: no Recommendations box on the Influencer tab; every other Organic Social view keeps it.
test('Recommendations renders nothing on the Influencer tab and renders on a platform tab', () => {
  const resolved = { id: 'recommendations', version: 1, label: 'Recommendations' }
  expect(recommendationsPart.render({ slug: 'c', viewKey: 'organic-social:influencer' }, resolved)).toBeNull()
  expect(recommendationsPart.render({ slug: 'c', viewKey: 'organic-social:instagram' }, resolved)).not.toBeNull()
})
