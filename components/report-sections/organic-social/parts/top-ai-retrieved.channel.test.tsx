import { expect, test } from 'vitest'
import { topAiRetrievedV1 } from './top-ai-retrieved'
import { FIXTURE_ORGANIC_SOCIAL_CTX } from './__fixtures__/organic-social-ctx'
import type { OrganicSocialCtx } from '../ctx'

// Owned AI-retrieved content is LinkedIn-only, so the part belongs on Overview
// (channel === null) and the LinkedIn subpage, and is hidden on the IG/FB/X
// subpages (where a LinkedIn article is off-context). render() is sync, so we can
// assert the returned node without mounting the async child.
const renderAt = (channel: OrganicSocialCtx['channel']) =>
  topAiRetrievedV1.render({ ...FIXTURE_ORGANIC_SOCIAL_CTX, channel }, undefined as never)

test('renders on Overview and LinkedIn, hidden on other platform subpages', () => {
  expect(renderAt(null)).not.toBeNull() // Overview
  expect(renderAt('LINKEDIN')).not.toBeNull() // LinkedIn subpage
  expect(renderAt('INSTAGRAM')).toBeNull()
  expect(renderAt('FACEBOOK')).toBeNull()
  expect(renderAt('TWITTER')).toBeNull()
})
