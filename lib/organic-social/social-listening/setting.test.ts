import { afterEach, describe, expect, it, vi } from 'vitest'
import { ORGANIC_SOCIAL_SUBSECTIONS, organicSocialSubsections, resolveOrganicSubsection, type OrganicTabsClient } from '@/lib/constants'
import { toPortalSidebarClient } from '@/lib/portal/sidebar-client'
import type { Client } from '@/lib/db/schema'
import {
  SOCIAL_LISTENING_TAB_ID, hasSocialListeningTab, logMalformedSocialListeningSetting, parseSocialListeningSetting, socialListeningSettingProblem,
} from './setting'

// Made-up topic names: the repo is public.
const valid = { enabled: true, brandTopic: 'Topic A' }
const withIndustry = { ...valid, industryTopic: 'Topic B' }
const RM = { firstMonth: '2026-07', clientMonths: 2 }

describe('parseSocialListeningSetting', () => {
  it('absent, null or enabled not exactly true gives off', () => {
    for (const raw of [undefined, null, { brandTopic: 'Topic A' }, { ...valid, enabled: false }, { ...valid, enabled: 'true' }, { ...valid, enabled: 1 }]) {
      expect(parseSocialListeningSetting(raw)).toEqual({ kind: 'off' })
    }
  })

  it('a valid setting gives ok with the defaults filled', () => {
    expect(parseSocialListeningSetting(valid)).toEqual({ kind: 'ok', setting: { brandTopic: 'Topic A', industryTopic: null, industrySample: null } })
    expect(parseSocialListeningSetting(withIndustry)).toEqual({ kind: 'ok', setting: { brandTopic: 'Topic A', industryTopic: 'Topic B', industrySample: null } })
    expect(parseSocialListeningSetting({ ...withIndustry, industrySample: 10 })).toEqual({ kind: 'ok', setting: { brandTopic: 'Topic A', industryTopic: 'Topic B', industrySample: 10 } })
    expect(parseSocialListeningSetting({ ...withIndustry, industrySample: 1 }).kind).toBe('ok')
    expect(parseSocialListeningSetting({ ...withIndustry, industrySample: 100 }).kind).toBe('ok')
  })

  it('topics are kept without surrounding spaces, so they match the export title', () => {
    expect(parseSocialListeningSetting({ enabled: true, brandTopic: '  Topic A ', industryTopic: ' Topic B' }))
      .toEqual({ kind: 'ok', setting: { brandTopic: 'Topic A', industryTopic: 'Topic B', industrySample: null } })
  })

  it('a bad key or value gives malformed with a reason naming the key and never the value', () => {
    const cases: [unknown, string][] = [
      // Unknown keys, including paidSheet: reserved for Phase 2 (paid sentiment) and refused until that build adds it.
      [{ ...valid, paidSheet: 'SECRET-SHEET' }, 'paidSheet'],
      [{ ...valid, brandtopic: 'SECRET-TYPO' }, 'brandtopic'],
      // Topics: missing, not a string, empty or only spaces.
      [{ enabled: true }, 'brandTopic'],
      [{ ...valid, brandTopic: 7 }, 'brandTopic'],
      [{ ...valid, brandTopic: '' }, 'brandTopic'],
      [{ ...valid, brandTopic: '   ' }, 'brandTopic'],
      [{ ...valid, industryTopic: '' }, 'industryTopic'],
      [{ ...valid, industryTopic: '  ' }, 'industryTopic'],
      [{ ...valid, industryTopic: 12 }, 'industryTopic'],
      [{ ...valid, industryTopic: null }, 'industryTopic'],
      // The two topics the same, also once spaces are dropped.
      [{ ...valid, industryTopic: 'Topic A' }, 'industryTopic'],
      [{ ...valid, industryTopic: ' Topic A  ' }, 'industryTopic'],
      // industrySample: an integer 1 to 100, and only with an industry topic (R2-8).
      [{ ...withIndustry, industrySample: 0 }, 'industrySample'],
      [{ ...withIndustry, industrySample: 101 }, 'industrySample'],
      [{ ...withIndustry, industrySample: 10.5 }, 'industrySample'],
      [{ ...withIndustry, industrySample: -5 }, 'industrySample'],
      [{ ...withIndustry, industrySample: '10' }, 'industrySample'],
      [{ ...withIndustry, industrySample: null }, 'industrySample'],
      [{ ...withIndustry, industrySample: Number.NaN }, 'industrySample'],
      [{ ...valid, industrySample: 10 }, 'industrySample'],
      // Not an object at all.
      ['yes', 'socialListening'],
      [[valid], 'socialListening'],
    ]
    for (const [raw, key] of cases) {
      const r = parseSocialListeningSetting(raw)
      expect(r.kind, JSON.stringify(raw)).toBe('malformed')
      const reason = (r as { reason: string }).reason
      expect(reason, JSON.stringify(raw)).toContain(key)
      for (const v of ['SECRET', 'Topic A', 'Topic B', '10.5', '101']) expect(reason, JSON.stringify(raw)).not.toContain(v)
    }
  })
})

describe('hasSocialListeningTab', () => {
  const dsc = (s: unknown, months = true) => ({ socialListening: s, ...(months ? { reportingMonths: RM } : {}) })

  it('is true only with a valid setting and reporting months', () => {
    expect(hasSocialListeningTab({ dashSocialConfig: dsc(valid) })).toBe(true)
    expect(hasSocialListeningTab({ dashSocialConfig: dsc(withIndustry) })).toBe(true)
    expect(hasSocialListeningTab({ dashSocialConfig: dsc(valid, false) })).toBe(false)
    expect(hasSocialListeningTab({ dashSocialConfig: dsc({ ...valid, paidSheet: 'x' }) })).toBe(false)
    expect(hasSocialListeningTab({ dashSocialConfig: dsc({ ...valid, enabled: false }) })).toBe(false)
    expect(hasSocialListeningTab({ dashSocialConfig: { reportingMonths: RM } })).toBe(false)
    expect(hasSocialListeningTab({ dashSocialConfig: null })).toBe(false)
    expect(hasSocialListeningTab({})).toBe(false)
  })

  it('hidden_reports holding the tab id hides it first, whichever record it is', () => {
    expect(SOCIAL_LISTENING_TAB_ID).toBe('organic-social-listening')
    expect(hasSocialListeningTab({ dashSocialConfig: dsc(valid), hiddenReports: [SOCIAL_LISTENING_TAB_ID] })).toBe(false)
    expect(hasSocialListeningTab({ socialListeningTab: true, hiddenReports: [SOCIAL_LISTENING_TAB_ID] })).toBe(false)
  })

  it("a trimmed record's boolean decides, without reading the setting (R2-6)", () => {
    expect(hasSocialListeningTab({ socialListeningTab: true })).toBe(true)
    expect(hasSocialListeningTab({ socialListeningTab: true, dashSocialConfig: {} })).toBe(true)
    expect(hasSocialListeningTab({ socialListeningTab: false, dashSocialConfig: dsc(valid) })).toBe(false)
  })
})

describe('socialListeningSettingProblem', () => {
  it('is null when the setting is off or usable', () => {
    expect(socialListeningSettingProblem({})).toBeNull()
    expect(socialListeningSettingProblem({ dashSocialConfig: null })).toBeNull()
    expect(socialListeningSettingProblem({ dashSocialConfig: { reportingMonths: RM } })).toBeNull()
    expect(socialListeningSettingProblem({ dashSocialConfig: { socialListening: valid, reportingMonths: RM } })).toBeNull()
  })

  it('names a malformed setting, or a valid one on a client without reporting months', () => {
    expect(socialListeningSettingProblem({ dashSocialConfig: { socialListening: { ...valid, paidSheet: 'x' }, reportingMonths: RM } })).toMatch(/paidSheet/)
    expect(socialListeningSettingProblem({ dashSocialConfig: { socialListening: valid } })).toMatch(/reportingMonths/)
  })
})

describe('logMalformedSocialListeningSetting', () => {
  afterEach(() => vi.restoreAllMocks())
  it('warns once with the slug and the reason, under the [social-listening] prefix', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logMalformedSocialListeningSetting('a-client', 'industrySample must be an integer from 1 to 100')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toBe('[social-listening] the socialListening setting is not usable, so the tab is off slug=a-client: industrySample must be an integer from 1 to 100')
  })
})

describe('the Organic Social tab list', () => {
  // A Renaissance-shaped client: its dash_social_config by shape (placeholders for every identifier, see
  // lib/organic-social/renaissance-locked-settings.test.ts), on reporting months, with no socialListening setting.
  const RENAISSANCE_SHAPED = {
    slug: 'a-client', name: 'A', logoUrl: null, enabledReports: ['organic-social'], hiddenReports: ['technical-audit', 'content-impact'],
    dashSocialConfig: { brandId: 1, ytdSheets: { 2026: { tab: 'Tab', sheetId: 'placeholder' } }, chartNotes: true, ownHandles: { instagram: 'own-handle' }, reportingMonths: RM },
  } as unknown as Client
  // Written out from organicSocialSubsections before this change (2026-11-19), so a change to it fails here.
  const TODAY = [
    { id: null, label: 'Overview', channel: null },
    { id: 'organic-influencer', label: 'Influencer', channel: null, view: 'influencer' },
    { id: 'organic-instagram', label: 'Instagram', channel: 'INSTAGRAM' },
    { id: 'organic-facebook', label: 'Facebook', channel: 'FACEBOOK' },
    { id: 'organic-linkedin', label: 'LinkedIn', channel: 'LINKEDIN' },
    { id: 'organic-x', label: 'X', channel: 'TWITTER' },
  ]
  const withSetting = (s: unknown, o: { rm?: boolean; hidden?: string[] } = {}) => {
    const { reportingMonths, ...rest } = (RENAISSANCE_SHAPED.dashSocialConfig ?? {}) as Record<string, unknown>
    return {
      ...RENAISSANCE_SHAPED,
      hiddenReports: o.hidden ?? RENAISSANCE_SHAPED.hiddenReports,
      dashSocialConfig: { ...rest, ...(o.rm === false ? {} : { reportingMonths }), socialListening: s },
    } as unknown as Client
  }
  const ids = (c: OrganicTabsClient) => organicSocialSubsections(c).map((s) => s.id)

  it('the Social Listening tab is last in the list, with no channel and its own view', () => {
    expect(ORGANIC_SOCIAL_SUBSECTIONS.at(-1)).toEqual({ id: 'organic-social-listening', label: 'Social Listening', channel: null, view: 'social-listening' })
  })

  it('a Renaissance-shaped client (no setting) gets exactly today\'s tab list, from the full row and from the portal record', () => {
    expect(organicSocialSubsections(RENAISSANCE_SHAPED)).toEqual(TODAY)
    expect(organicSocialSubsections(toPortalSidebarClient(RENAISSANCE_SHAPED))).toEqual(TODAY)
    expect(toPortalSidebarClient(RENAISSANCE_SHAPED)).not.toHaveProperty('socialListeningTab')
  })

  it('a client with the setting and reporting months gets the tab last; the report still opens on Overview', () => {
    const c = withSetting(withIndustry)
    expect(organicSocialSubsections(c)).toEqual([...TODAY, { id: 'organic-social-listening', label: 'Social Listening', channel: null, view: 'social-listening' }])
    expect(resolveOrganicSubsection(c).id).toBeNull()
    expect(resolveOrganicSubsection(c, 'organic-social-listening').view).toBe('social-listening')
  })

  it('with Overview hidden the report still opens on a platform tab, and the tab stays last', () => {
    const c = withSetting(valid, { hidden: ['organic-overview'] })
    expect(ids(c)).toEqual(['organic-instagram', 'organic-influencer', 'organic-facebook', 'organic-linkedin', 'organic-x', 'organic-social-listening'])
    expect(resolveOrganicSubsection(c).id).toBe('organic-instagram')
  })

  it.each([
    ['with the setting and reporting months', withSetting(valid), true],
    ['without the setting', RENAISSANCE_SHAPED, false],
    ['with the setting but no reporting months', withSetting(valid, { rm: false }), false],
    ['with a malformed setting', withSetting({ ...valid, paidSheet: 'x' }), false],
    ['with the setting, the tab hidden', withSetting(valid, { hidden: ['organic-social-listening'] }), false],
  ])('a full row and its trimmed portal record give the same tab ids: %s', (_, c, expected) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(ids(c).includes('organic-social-listening')).toBe(expected)
    expect(ids(toPortalSidebarClient(c))).toEqual(ids(c))
    vi.restoreAllMocks()
  })

  it('a hand-typed Social Listening subsection on a client without the tab resolves to the first tab, as any unknown tab does', () => {
    expect(resolveOrganicSubsection(RENAISSANCE_SHAPED, 'organic-social-listening').id).toBeNull()
  })
})
