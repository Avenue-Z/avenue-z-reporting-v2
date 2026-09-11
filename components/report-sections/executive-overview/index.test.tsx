import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest'
import { render, screen, within } from '@testing-library/react'

/**
 * index.tsx had NO test coverage at all: `crmScoped` could be hardcoded to
 * false and the whole suite stayed green at 919/919, while every scoped client
 * silently reverted to the unscoped contacts series under an unscoped heading.
 *
 * These tests cover the routing decision that file makes and nothing else. The
 * ten GA4/Peec fetches are mocked to a minimal shape because the subject here is
 * WHICH CRM series is chosen and WHAT the section is labelled, not the charts.
 */
vi.mock('@/lib/ga4/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ga4/client')>()),
  ga4Query: vi.fn(async () => ({ rows: [] })),
}))
vi.mock('@/lib/peec/client', () => ({ getPeecOverview: vi.fn(async () => null) }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn() }))
vi.mock('@/lib/salesforce/pipeline', () => ({ getSalesforcePipeline: vi.fn(async () => null) }))
vi.mock('@/lib/salesforce/contacts', () => ({ getSalesforceWeeklyContacts: vi.fn(async () => null) }))
vi.mock('@/lib/salesforce/leads', () => ({ getSalesforceWeeklyLeads: vi.fn(async () => null) }))

import { ga4Query } from '@/lib/ga4/client'
import { getClientBySlug } from '@/lib/db/queries'
import { getSalesforceWeeklyContacts } from '@/lib/salesforce/contacts'
import { getSalesforceWeeklyLeads } from '@/lib/salesforce/leads'
import { ExecutiveOverviewReport } from './index'

const NAMES = ['2026 - Inbound Prospecting', '2026 - Inbound Prospecting - Brokers']

/** A client row with Salesforce configured, optionally campaign-scoped.
 *  smApiKeyEnvVar names the shared key both isSalesforceConfigured and
 *  canQuerySalesforce require (lib/salesforce/configured.ts). */
const client = (campaignNames?: string[]) =>
  ({
    slug: 'renaissance',
    smApiKeyEnvVar: 'SM_API_KEY_TEST',
    salesforceConfig: { salesforceAccountId: '00D', campaignNames },
  }) as unknown as Awaited<ReturnType<typeof getClientBySlug>>

async function renderReport() {
  render(await ExecutiveOverviewReport({ clientSlug: 'renaissance' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  // The shared Supermetrics key, which canQuerySalesforce also requires.
  vi.stubEnv('SM_API_KEY_TEST', 'test-key')
})

describe('a campaign-scoped client', () => {
  beforeEach(() => (getClientBySlug as Mock).mockResolvedValue(client(NAMES)))

  it('fetches the LEADS series, never contacts', async () => {
    // Contacts cannot be campaign-scoped at all (the connector rejects the
    // dimension), so fetching them here puts an unscoped inbound number beside
    // scoped revenue.
    await renderReport()
    expect(getSalesforceWeeklyLeads).toHaveBeenCalledWith('renaissance')
    expect(getSalesforceWeeklyContacts).not.toHaveBeenCalled()
  })

  it('heads the block "Lead Creation" and says the figures are scoped', async () => {
    await renderReport()
    expect(screen.getByText('Lead Creation')).toBeInTheDocument()
    expect(screen.queryByText('Contact Creation')).not.toBeInTheDocument()
    expect(screen.getByText('Scoped to agency-sourced campaigns.')).toBeInTheDocument()
  })

  it('passes the scope through to the funnel card, which sits above that heading', async () => {
    // The seam this pins. buildStages defaults crmScoped to false, so deleting
    // the argument from the call in index.tsx left the whole suite green while
    // rendering "Online Contacts" on the funnel card directly above a "Lead
    // Creation" heading. Both sides were tested; nothing asserted that THIS
    // file supplies the value.
    await renderReport()
    expect(screen.getByText('Online Leads')).toBeInTheDocument()
    expect(screen.queryByText('Online Contacts')).not.toBeInTheDocument()
  })

  it('names leads, not contacts, in the failure message', async () => {
    await renderReport()
    expect(screen.getByText("Couldn't load lead data.")).toBeInTheDocument()
  })
})

describe('a whole-org client', () => {
  beforeEach(() => (getClientBySlug as Mock).mockResolvedValue(client(undefined)))

  it('fetches the CONTACTS series and labels the block accordingly', async () => {
    await renderReport()
    expect(getSalesforceWeeklyContacts).toHaveBeenCalledWith('renaissance')
    expect(getSalesforceWeeklyLeads).not.toHaveBeenCalled()
    expect(screen.getByText('Contact Creation')).toBeInTheDocument()
    expect(screen.queryByText('Scoped to agency-sourced campaigns.')).not.toBeInTheDocument()
    expect(screen.getByText("Couldn't load contact data.")).toBeInTheDocument()
  })

  it('leaves the funnel card naming contacts, matching its heading', async () => {
    // The other direction of the same seam: a hardcoded `crmScoped: true` would
    // put "Online Leads" over a whole-org contacts series.
    await renderReport()
    expect(screen.getByText('Online Contacts')).toBeInTheDocument()
    expect(screen.queryByText('Online Leads')).not.toBeInTheDocument()
  })
})

/**
 * The reviewed defect. `campaignNames?.length > 0` disagrees with
 * filterByCampaign, which normalizes and drops blanks before building its match
 * set. For [' '] the length test says "scoped" while the filter applies nothing,
 * so the page printed a scope claim over the client's entire book.
 */
describe('a config whose names all normalize away is not a scope', () => {
  for (const names of [[' '], [''], ['  ', '']]) {
    it(`treats ${JSON.stringify(names)} as whole-org, matching what the filter actually does`, async () => {
      ;(getClientBySlug as Mock).mockResolvedValue(client(names))
      await renderReport()
      expect(getSalesforceWeeklyContacts).toHaveBeenCalled()
      expect(getSalesforceWeeklyLeads).not.toHaveBeenCalled()
      expect(screen.queryByText('Scoped to agency-sourced campaigns.')).not.toBeInTheDocument()
      expect(screen.getByText('Contact Creation')).toBeInTheDocument()
    })
  }
})

describe('a client with no CRM configured', () => {
  it('issues no CRM request and prompts to connect rather than reporting a failure', async () => {
    ;(getClientBySlug as Mock).mockResolvedValue({ slug: 'acme' } as never)
    await renderReport()
    expect(getSalesforceWeeklyContacts).not.toHaveBeenCalled()
    expect(getSalesforceWeeklyLeads).not.toHaveBeenCalled()
    expect(screen.queryByText(/Couldn't load/)).not.toBeInTheDocument()
    expect(screen.getByText('Contact Creation')).toBeInTheDocument()
  })
})

/**
 * PR `#235` round-two review (Thomas): `hasLeadEvents(rawGa4Config) ? rawGa4Config
 * : null` at index.tsx's `ga4Config` gate had zero coverage — mutating it to a
 * bare `rawGa4Config` (i.e. treating an empty/malformed config as configured)
 * left the full suite green. These pin what that gate actually controls:
 * whether the eventName-filtered query is issued at all, and which number
 * ends up on the Conversions tile.
 */
describe('the ga4Config gate', () => {
  const totalsRow = { sessions: 1000, conversions: 999, sessionConversionRate: 0.05 }

  beforeEach(() => {
    ;(ga4Query as Mock).mockImplementation(async (params: { dimensions?: string[] }) =>
      params.dimensions?.includes('eventName')
        ? { rows: [{ eventName: 'real_lead', eventCount: 7 }] }
        : { rows: [totalsRow] },
    )
  })

  // '999' / '7' each render twice on a successful page — once on the KPI grid's
  // Conversions card, once in the journey card's Conversions stat, since the
  // fix deliberately keeps both in sync. getAllByText, not getByText.
  it('issues no eventName query for a client with no ga4Config, and the raw totals conversions render', async () => {
    ;(getClientBySlug as Mock).mockResolvedValue({ slug: 'renaissance' } as never)
    await renderReport()
    expect((ga4Query as Mock).mock.calls.some((c) => (c[0] as { dimensions?: string[] }).dimensions?.includes('eventName'))).toBe(false)
    expect(screen.getAllByText('999').length).toBeGreaterThan(0)
  })

  it('treats an empty leadEvents array as unconfigured — no query, raw totals render', async () => {
    ;(getClientBySlug as Mock).mockResolvedValue({ slug: 'renaissance', ga4Config: { leadEvents: [] } } as never)
    await renderReport()
    expect((ga4Query as Mock).mock.calls.some((c) => (c[0] as { dimensions?: string[] }).dimensions?.includes('eventName'))).toBe(false)
    expect(screen.getAllByText('999').length).toBeGreaterThan(0)
    expect(screen.queryByText('7')).not.toBeInTheDocument()
  })

  it('issues the eventName query and renders ITS total, not the raw conversions, when configured', async () => {
    ;(getClientBySlug as Mock).mockResolvedValue({
      slug: 'renaissance',
      ga4Config: { leadEvents: [{ name: 'real_lead', sourceEvents: ['real_lead'] }] },
    } as never)
    await renderReport()
    expect((ga4Query as Mock).mock.calls.some((c) => (c[0] as { dimensions?: string[] }).dimensions?.includes('eventName'))).toBe(true)
    expect(screen.getAllByText('7').length).toBeGreaterThan(0)
    expect(screen.queryByText('999')).not.toBeInTheDocument()
  })

  /**
   * Round three (Thomas, Paul): `deriveConversions` is unit-tested directly
   * in lib/ga4/lead-events.test.ts now, but the two reviewers specifically
   * also wanted render-level proof that index.tsx wires it correctly into
   * the KPI tile — a pure-function test can't catch a wiring bug (passing
   * the wrong args, reading the wrong field off the return value).
   */
  // "Conversions" also labels a stat row on the journey card (a <span>,
  // different classes) — the KpiCard title is specifically a <p>, so filter
  // to that before walking up to its card container.
  const kpiValue = (title: string) => {
    const titleEl = screen.getAllByText(title).find((el) => el.tagName === 'P')
    if (!titleEl) throw new Error(`no KpiCard title element found for "${title}"`)
    const card = titleEl.closest('.rounded-lg')
    if (!card) throw new Error(`no KpiCard container found for "${title}"`)
    return within(card as HTMLElement)
  }

  it('a failed filtered fetch dashes the Conversions AND Conversion Rate KPI tiles — never the raw count, never a fabricated 0', async () => {
    ;(ga4Query as Mock).mockImplementation(async (params: { dimensions?: string[] }) => {
      if (params.dimensions?.includes('eventName')) throw new Error('GA4 5xx')
      return { rows: [totalsRow] }
    })
    ;(getClientBySlug as Mock).mockResolvedValue({
      slug: 'renaissance',
      ga4Config: { leadEvents: [{ name: 'real_lead', sourceEvents: ['real_lead'] }] },
    } as never)
    await renderReport()
    expect(kpiValue('Conversions').getByText('—')).toBeInTheDocument()
    expect(kpiValue('Conversion Rate').getByText('—')).toBeInTheDocument()
    // Never the raw totals, and never a red -100% badge from a fabricated 0.
    expect(kpiValue('Conversions').queryByText('999')).not.toBeInTheDocument()
    expect(screen.queryByText(/100\.0%/)).not.toBeInTheDocument()
  })

  it('the Conversions delta compares against the filtered prior period, not the raw one', async () => {
    // index.tsx builds its Promise.allSettled array in source order, main
    // period's eventName query before the compare period's, so the array
    // literal's left-to-right evaluation calls this mock for main first —
    // reliable without needing to know the actual dateRange strings.
    let firstDateRange: string | undefined
    ;(ga4Query as Mock).mockImplementation(async (params: { dateRange: string; dimensions?: string[] }) => {
      if (!params.dimensions?.includes('eventName')) return { rows: [totalsRow] }
      if (firstDateRange === undefined) firstDateRange = params.dateRange
      const isMain = params.dateRange === firstDateRange
      return { rows: [{ eventName: 'real_lead', eventCount: isMain ? 50 : 40 }] }
    })
    ;(getClientBySlug as Mock).mockResolvedValue({
      slug: 'renaissance',
      ga4Config: { leadEvents: [{ name: 'real_lead', sourceEvents: ['real_lead'] }] },
    } as never)
    await renderReport()
    // 50 vs 40 filtered = +25.0%, not whatever 999 (raw) vs the raw compare
    // total would give. Renders on both the KPI tile and the journey card.
    expect(screen.getAllByText(/25\.0%/).length).toBeGreaterThan(0)
  })
})
