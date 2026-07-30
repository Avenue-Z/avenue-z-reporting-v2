import { expect, test } from 'vitest'
import { resolveOrganicSubsection, ORGANIC_SOCIAL_SUBSECTIONS } from '@/lib/constants'
import type { Client, DashSocialConfig } from '@/lib/db/schema'

const client = (over: Partial<Client> = {}): Client =>
  ({ dashSocialConfig: { brandId: 1, channels: undefined }, hiddenReports: [], ...over } as Client)

test('order is Overview, Instagram, Facebook, LinkedIn, X', () => {
  expect(ORGANIC_SOCIAL_SUBSECTIONS.map((s) => s.id)).toEqual([null, 'instagram', 'facebook', 'linkedin', 'x'])
})

test('unknown subsection resolves to Overview (never null)', () => {
  expect(resolveOrganicSubsection(client(), 'nope').channel).toBeNull()
})

test('a configured channel resolves to its entry', () => {
  expect(resolveOrganicSubsection(client(), 'linkedin').channel).toBe('LINKEDIN')
})

test('a channel outside the allowlist degrades to Overview', () => {
  const cfg: DashSocialConfig = { brandId: 1, channels: ['instagram'] }
  const c = client({ dashSocialConfig: cfg })
  expect(resolveOrganicSubsection(c, 'linkedin').channel).toBeNull()
})

test('a hidden subsection degrades to Overview', () => {
  const c = client({ hiddenReports: ['linkedin'] as unknown as Client['hiddenReports'] })
  expect(resolveOrganicSubsection(c, 'linkedin').channel).toBeNull()
})
