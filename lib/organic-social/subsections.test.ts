import { expect, test } from 'vitest'
import { resolveOrganicSubsection, ORGANIC_SOCIAL_SUBSECTIONS } from '@/lib/constants'
import type { Client, DashSocialConfig } from '@/lib/db/schema'

const client = (over: Partial<Client> = {}): Client =>
  ({ dashSocialConfig: { brandId: 1, channels: undefined }, hiddenReports: [], ...over } as Client)

test('order is Overview, Instagram, Facebook, LinkedIn, X', () => {
  expect(ORGANIC_SOCIAL_SUBSECTIONS.map((s) => s.id)).toEqual(
    [null, 'organic-instagram', 'organic-facebook', 'organic-linkedin', 'organic-x'],
  )
})

test('unknown subsection resolves to Overview (never null)', () => {
  expect(resolveOrganicSubsection(client(), 'nope').channel).toBeNull()
})

test('a configured channel resolves to its entry', () => {
  expect(resolveOrganicSubsection(client(), 'organic-linkedin').channel).toBe('LINKEDIN')
})

test('a channel outside the allowlist degrades to Overview', () => {
  const cfg: DashSocialConfig = { brandId: 1, channels: ['instagram'] }
  const c = client({ dashSocialConfig: cfg })
  expect(resolveOrganicSubsection(c, 'organic-linkedin').channel).toBeNull()
})

test('a hidden subsection degrades to Overview', () => {
  const c = client({ hiddenReports: ['organic-linkedin'] as unknown as Client['hiddenReports'] })
  expect(resolveOrganicSubsection(c, 'organic-linkedin').channel).toBeNull()
})

// PR #174 review — the actual bug this namespacing fixes: Paid Media's LinkedIn Advertising
// subsection also uses the bare id 'linkedin'. Hiding it must NOT also hide Organic Social's
// LinkedIn tab now that the ids no longer collide.
test('hiding Paid Media LinkedIn does not hide Organic Social LinkedIn', () => {
  const c = client({ hiddenReports: ['linkedin'] as unknown as Client['hiddenReports'] })
  expect(resolveOrganicSubsection(c, 'organic-linkedin').channel).toBe('LINKEDIN')
})
