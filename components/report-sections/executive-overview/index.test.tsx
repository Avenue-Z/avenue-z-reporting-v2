import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest'
import { render, screen } from '@testing-library/react'

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
