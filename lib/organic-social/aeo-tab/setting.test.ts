import { afterEach, describe, expect, it, vi } from 'vitest'
import { AEO_TAB_ID, hasAeoInformedTab, logMalformedAeoSetting, parseAeoInformedSetting } from './setting'

const valid = { enabled: true, allTimeFrom: '2026-01-22' }

describe('parseAeoInformedSetting', () => {
  it('absent, null or enabled not exactly true gives off', () => {
    for (const raw of [undefined, null, { allTimeFrom: '2026-01-22' }, { ...valid, enabled: false }, { ...valid, enabled: 'true' }, { ...valid, enabled: 1 }]) {
      expect(parseAeoInformedSetting(raw)).toEqual({ kind: 'off' })
    }
  })
  it('a valid setting gives ok with the defaults filled', () => {
    expect(parseAeoInformedSetting(valid)).toEqual({ kind: 'ok', setting: { allTimeFrom: '2026-01-22', selector: 'Organic Social', fourthGraph: 'instagram' } })
    expect(parseAeoInformedSetting({ ...valid, selector: 'Social', fourthGraph: 'tiktok' })).toEqual({ kind: 'ok', setting: { allTimeFrom: '2026-01-22', selector: 'Social', fourthGraph: 'tiktok' } })
  })
  it('a bad allTimeFrom, selector or fourthGraph, or an unknown key, gives malformed with a reason naming the key and never the value', () => {
    const cases: [unknown, string][] = [
      [{ ...valid, allTimeFrom: undefined }, 'allTimeFrom'],
      [{ ...valid, allTimeFrom: '2026-1-22' }, 'allTimeFrom'],
      [{ ...valid, allTimeFrom: '2026-02-30' }, 'allTimeFrom'],
      [{ ...valid, allTimeFrom: 20260122 }, 'allTimeFrom'],
      [{ ...valid, selector: '' }, 'selector'],
      [{ ...valid, selector: '   ' }, 'selector'],
      [{ ...valid, selector: 7 }, 'selector'],
      [{ ...valid, fourthGraph: 'linkedin' }, 'fourthGraph'],
      [{ ...valid, fourthGraph: 'youtube' }, 'fourthGraph'],
      [{ ...valid, fourthGraph: 'reddit' }, 'fourthGraph'],
      [{ ...valid, fourthGraph: 'TikTok' }, 'fourthGraph'],
      [{ ...valid, fourthgraph: 'tiktok' }, 'fourthgraph'],
      ['yes', 'aeoInformedSocial'],
      [[valid], 'aeoInformedSocial'],
    ]
    for (const [raw, key] of cases) {
      const r = parseAeoInformedSetting(raw)
      expect(r.kind, JSON.stringify(raw)).toBe('malformed')
      const reason = (r as { reason: string }).reason
      expect(reason).toContain(key)
      for (const v of ['2026-1-22', '2026-02-30', 'linkedin', 'youtube', 'reddit', 'TikTok']) if (!key.includes(v)) expect(reason).not.toContain(v)
    }
  })
})

describe('hasAeoInformedTab', () => {
  const dsc = (s: unknown) => ({ aeoInformedSocial: s })
  it('is true only with a valid setting and a non-empty Peec project id', () => {
    expect(hasAeoInformedTab({ dashSocialConfig: dsc(valid), peecCustomerProjectId: 'or_p' })).toBe(true)
    expect(hasAeoInformedTab({ dashSocialConfig: dsc(valid), peecCustomerProjectId: null })).toBe(false)
    expect(hasAeoInformedTab({ dashSocialConfig: dsc(valid), peecCustomerProjectId: '  ' })).toBe(false)
    expect(hasAeoInformedTab({ dashSocialConfig: dsc(valid) })).toBe(false)
    expect(hasAeoInformedTab({ dashSocialConfig: dsc({ ...valid, fourthGraph: 'reddit' }), peecCustomerProjectId: 'or_p' })).toBe(false)
    expect(hasAeoInformedTab({ dashSocialConfig: {}, peecCustomerProjectId: 'or_p' })).toBe(false)
    expect(hasAeoInformedTab({ dashSocialConfig: null, peecCustomerProjectId: 'or_p' })).toBe(false)
    expect(hasAeoInformedTab({})).toBe(false)
  })
  it('a record carrying aeoInformedTab returns it without reading the setting', () => {
    expect(hasAeoInformedTab({ aeoInformedTab: true })).toBe(true)
    expect(hasAeoInformedTab({ aeoInformedTab: false, dashSocialConfig: dsc(valid), peecCustomerProjectId: 'or_p' })).toBe(false)
  })
  it('hidden_reports containing organic-aeo-informed gives false, whichever record it is', () => {
    expect(AEO_TAB_ID).toBe('organic-aeo-informed')
    expect(hasAeoInformedTab({ dashSocialConfig: dsc(valid), peecCustomerProjectId: 'or_p', hiddenReports: [AEO_TAB_ID] })).toBe(false)
    expect(hasAeoInformedTab({ aeoInformedTab: true, hiddenReports: [AEO_TAB_ID] })).toBe(false)
  })
})

describe('logMalformedAeoSetting', () => {
  afterEach(() => vi.restoreAllMocks())
  it('warns once with the slug and the reason, under the [aeo-informed] prefix', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logMalformedAeoSetting('a-client', 'fourthGraph must be instagram or tiktok')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toBe('[aeo-informed] the aeoInformedSocial setting is not usable, so the tab is off slug=a-client: fourthGraph must be instagram or tiktok')
  })
})
