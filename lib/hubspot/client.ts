import { cache } from 'react'
import { Client } from '@hubspot/api-client'
import { FilterOperatorEnum as DealFilterOp } from '@hubspot/api-client/lib/codegen/crm/deals/models/Filter'
import { getClientBySlug } from '@/lib/db/queries'
import { cached } from '@/lib/cache'
import { byClient } from '@/lib/perf'
import { createRateLimiter } from './rate-limit'

const _clients = new Map<string, Client>()

// HubSpot's SEARCH API is quota-limited to ~4 requests/second (other endpoints
// have far higher limits). Every contacts/deals search below funnels through
// this single limiter, so call sites can fan out with Promise.all without
// exceeding quota on a cold (cache-miss) render. Non-search calls (owners,
// forms, form-integrations fetch) are intentionally left unthrottled.
const hsRate = createRateLimiter(4)

type ContactSearchReq = Parameters<Client['crm']['contacts']['searchApi']['doSearch']>[0]
type DealSearchReq = Parameters<Client['crm']['deals']['searchApi']['doSearch']>[0]

const searchContacts = (client: Client, req: ContactSearchReq) =>
  hsRate(() => client.crm.contacts.searchApi.doSearch(req))
const searchDeals = (client: Client, req: DealSearchReq) =>
  hsRate(() => client.crm.deals.searchApi.doSearch(req))

async function getHubSpotClientImpl(clientSlug: string): Promise<Client> {
  if (_clients.has(clientSlug)) return _clients.get(clientSlug)!

  const config = await getClientBySlug(clientSlug)
  if (!config) throw new Error(`Unknown client: ${clientSlug}`)
  if (!config.hubspotTokenEnvVar) throw new Error(`HubSpot not configured for client: ${clientSlug}`)

  const token = process.env[config.hubspotTokenEnvVar]
  if (!token) throw new Error(`Missing env var: ${config.hubspotTokenEnvVar}`)

  const client = new Client({ accessToken: token })
  _clients.set(clientSlug, client)
  return client
}

export type HubSpotDeal = {
  id: string
  properties: {
    dealname: string | null
    amount: string | null
    closedate: string | null
    createdate: string | null
    dealstage: string | null
    hubspot_owner_id: string | null
    hs_deal_stage_probability: string | null
    [key: string]: string | null
  }
}

export type OwnerMap = Record<string, string>

/** Fetch all deals in pipeline 714699412, paginating until exhausted. */
async function getPipelineDealsImpl(clientSlug: string): Promise<HubSpotDeal[]> {
  const hs = await getHubSpotClient(clientSlug)
  const deals: HubSpotDeal[] = []
  let after: string | undefined

  do {
    const res = await searchDeals(hs, {
      filterGroups: [{
        filters: [{
          propertyName: 'pipeline',
          operator: DealFilterOp.Eq,
          value: '714699412',
        }],
      }],
      properties: [
        'dealname', 'amount', 'closedate', 'createdate', 'dealstage', 'hubspot_owner_id',
        'hs_deal_stage_probability', 'hs_v2_date_entered_current_stage',
        'deal_source_1',
      ],
      sorts: ['-closedate'],
      limit: 200,
      after: after ?? '0',
    })

    deals.push(...(res.results as unknown as HubSpotDeal[]))
    after = res.paging?.next?.after
  } while (after)

  return deals
}

/** Fetch all owners and return a map of id → display name. */
async function getOwnerMapImpl(clientSlug: string): Promise<OwnerMap> {
  const hs = await getHubSpotClient(clientSlug)
  const map: OwnerMap = {}

  try {
    const res = await hs.crm.owners.ownersApi.getPage(undefined, undefined, 100)
    for (const owner of res.results ?? []) {
      const name = [owner.firstName, owner.lastName].filter(Boolean).join(' ') || owner.email || String(owner.id)
      map[String(owner.id)] = name
    }
  } catch {
    // non-fatal — caller falls back to raw IDs
  }

  return map
}

// ---------------------------------------------------------------------------
// Shared inbound contact data — one pagination pass per request, cached via
// React's request-scoped cache() so all stat functions share a single fetch.
// ---------------------------------------------------------------------------

type ProfileBucket = { icp: number; mcp: number; unidentified: number }

type InboundBuckets = {
  total: number
  icp: number
  mcp: number
  unidentified: number
  bySource:  Record<string, ProfileBucket>
  byMonth:   Record<string, ProfileBucket>  // key: "2026-04"
  byDay:     Record<string, ProfileBucket>  // key: "2026-04-28"
  byForm:    Record<string, ProfileBucket>  // key: form name (full-year aggregate)
  byDayForm: Record<string, Record<string, ProfileBucket>>  // dayKey → formName → counts
}

const load2025InboundContacts = cache(async (clientSlug: string): Promise<InboundBuckets> => {
  const hs = await getHubSpotClient(clientSlug)
  const yrStart = String(new Date('2025-01-01T00:00:00Z').getTime())
  const yrEnd   = String(new Date('2026-01-01T00:00:00Z').getTime())

  const data: InboundBuckets = {
    total: 0, icp: 0, mcp: 0, unidentified: 0,
    bySource: {}, byMonth: {}, byDay: {}, byForm: {}, byDayForm: {},
  }

  const bump = (bucket: ProfileBucket, isIcp: boolean, isMcp: boolean) => {
    if (isIcp) bucket.icp++
    else if (isMcp) bucket.mcp++
    else bucket.unidentified++
  }

  const ensureBucket = (map: Record<string, ProfileBucket>, key: string) => {
    if (!map[key]) map[key] = { icp: 0, mcp: 0, unidentified: 0 }
    return map[key]
  }

  let after: string | undefined
  do {
    const res = await searchContacts(hs, {
      filterGroups: [{
        filters: [
          { propertyName: 'createdate',          operator: 'GTE', value: yrStart },
          { propertyName: 'createdate',          operator: 'LT',  value: yrEnd   },
          { propertyName: 'hs_analytics_source', operator: 'NEQ', value: 'OFFLINE' },
        ] as any,
      }],
      properties: ['createdate', 'profile', 'hs_analytics_source', 'hs_analytics_first_form_name'],
      limit: 200,
      after: after ?? '0',
      sorts: [],
    })

    for (const contact of res.results ?? []) {
      const props = contact.properties as Record<string, string | null>
      const cd    = props.createdate
      if (!cd) continue
      const d = new Date(cd)
      if (isNaN(d.getTime())) continue

      const profile  = props.profile ?? ''
      const isIcp    = profile.includes('ICP')
      const isMcp    = !isIcp && profile.includes('MCP')
      const source   = props.hs_analytics_source ?? 'Unknown'
      const formName = props.hs_analytics_first_form_name ?? '(Direct / Unknown)'

      const monthKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      const dayKey   = `${monthKey}-${String(d.getUTCDate()).padStart(2, '0')}`

      data.total++
      if (isIcp) data.icp++
      else if (isMcp) data.mcp++
      else data.unidentified++

      bump(ensureBucket(data.bySource, source),   isIcp, isMcp)
      bump(ensureBucket(data.byMonth,  monthKey), isIcp, isMcp)
      bump(ensureBucket(data.byDay,    dayKey),   isIcp, isMcp)
      bump(ensureBucket(data.byForm,   formName), isIcp, isMcp)
      if (!data.byDayForm[dayKey]) data.byDayForm[dayKey] = {}
      bump(ensureBucket(data.byDayForm[dayKey], formName), isIcp, isMcp)
    }

    after = res.paging?.next?.after
  } while (after)

  return data
})

const load2026InboundContacts = cache(async (clientSlug: string): Promise<InboundBuckets> => {
  const hs = await getHubSpotClient(clientSlug)
  const yr2026Start = String(new Date('2026-01-01T00:00:00Z').getTime())
  const yr2026End   = String(new Date('2027-01-01T00:00:00Z').getTime())

  const data: InboundBuckets = {
    total: 0, icp: 0, mcp: 0, unidentified: 0,
    bySource: {}, byMonth: {}, byDay: {}, byForm: {}, byDayForm: {},
  }

  const bump = (bucket: ProfileBucket, isIcp: boolean, isMcp: boolean) => {
    if (isIcp) bucket.icp++
    else if (isMcp) bucket.mcp++
    else bucket.unidentified++
  }

  const ensureBucket = (map: Record<string, ProfileBucket>, key: string) => {
    if (!map[key]) map[key] = { icp: 0, mcp: 0, unidentified: 0 }
    return map[key]
  }

  let after: string | undefined
  do {
    const res = await searchContacts(hs, {
      filterGroups: [{
        filters: [
          { propertyName: 'createdate',          operator: 'GTE', value: yr2026Start },
          { propertyName: 'createdate',          operator: 'LT',  value: yr2026End   },
          { propertyName: 'hs_analytics_source', operator: 'NEQ', value: 'OFFLINE'   },
        ] as any,
      }],
      properties: ['createdate', 'profile', 'hs_analytics_source', 'hs_analytics_first_form_name'],
      limit: 200,
      after: after ?? '0',
      sorts: [],
    })

    for (const contact of res.results ?? []) {
      const props    = contact.properties as Record<string, string | null>
      const cd       = props.createdate
      if (!cd) continue
      const d = new Date(cd)
      if (isNaN(d.getTime())) continue

      const profile  = props.profile ?? ''
      const source   = props.hs_analytics_source ?? 'Unknown'
      const formName = props.hs_analytics_first_form_name ?? '(Direct / Unknown)'
      const isIcp    = profile.includes('ICP')
      const isMcp    = !isIcp && profile.includes('MCP')

      const monthKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      const dayKey   = `${monthKey}-${String(d.getUTCDate()).padStart(2, '0')}`

      data.total++
      if (isIcp) data.icp++
      else if (isMcp) data.mcp++
      else data.unidentified++

      bump(ensureBucket(data.bySource, source),   isIcp, isMcp)
      bump(ensureBucket(data.byMonth,  monthKey), isIcp, isMcp)
      bump(ensureBucket(data.byDay,    dayKey),   isIcp, isMcp)
      bump(ensureBucket(data.byForm,   formName), isIcp, isMcp)
      if (!data.byDayForm[dayKey]) data.byDayForm[dayKey] = {}
      bump(ensureBucket(data.byDayForm[dayKey], formName), isIcp, isMcp)
    }

    after = res.paging?.next?.after
  } while (after)

  return data
})

function bucketTotal(b: ProfileBucket): number {
  return b.icp + b.mcp + b.unidentified
}

function sumDays(byDay: Record<string, ProfileBucket>, startDate: Date, endDate: Date): ProfileBucket {
  const out: ProfileBucket = { icp: 0, mcp: 0, unidentified: 0 }
  const d = new Date(startDate)
  while (d < endDate) {
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    const b = byDay[key]
    if (b) { out.icp += b.icp; out.mcp += b.mcp; out.unidentified += b.unidentified }
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

// ---------------------------------------------------------------------------
// Public stat functions — all derived from the shared cached pagination
// ---------------------------------------------------------------------------

/** Fetch inbound funnel contact counts by source and profile. */
async function getContactStatsImpl(clientSlug: string) {
  const hs   = await getHubSpotClient(clientSlug)
  const data = await load2026InboundContacts(clientSlug)

  const yr2026Start = String(new Date('2026-01-01T00:00:00Z').getTime())
  const yr2026End   = String(new Date('2027-01-01T00:00:00Z').getTime())

  // Offline is excluded from the inbound cache — one dedicated count query
  let offline: number | null = null
  try {
    const res = await searchContacts(hs, {
      filterGroups: [{ filters: [
        { propertyName: 'createdate',          operator: 'GTE', value: yr2026Start },
        { propertyName: 'createdate',          operator: 'LT',  value: yr2026End   },
        { propertyName: 'hs_analytics_source', operator: 'EQ',  value: 'OFFLINE'   },
      ] as any }],
      properties: [], limit: 1, after: '0', sorts: [],
    })
    offline = res.total ?? 0
  } catch { /* non-fatal */ }

  return {
    online:  data.total,
    icp:     data.icp,
    mcp:     data.mcp,
    offline,
  }
}

export type ContactSourceBreakdown = {
  source: string
  icp: number
  mcp: number
  unidentified: number
}[]

/**
 * Same-period-last-year contact stats (Jan 1–today in 2025).
 * Uses the cached 2025 data — no extra pagination if getWeeklyYTDContacts
 * has already been called in the same request.
 */
async function getContactStatsYoYImpl(clientSlug: string): Promise<{
  online: number
  icp: number
  mcp: number
  offline: number | null
}> {
  const hs   = await getHubSpotClient(clientSlug)
  const data = await load2025InboundContacts(clientSlug)

  // Mirror the 2026 YTD window in 2025
  const today     = new Date()
  const splyStart = new Date(Date.UTC(2025, 0, 1))
  // +1 day so "today's date" is included (exclusive end)
  const splyEnd   = new Date(Date.UTC(2025, today.getUTCMonth(), today.getUTCDate() + 1))

  const b = sumDays(data.byDay, splyStart, splyEnd)

  let offline: number | null = null
  try {
    const res = await searchContacts(hs, {
      filterGroups: [{ filters: [
        { propertyName: 'createdate',          operator: 'GTE', value: String(splyStart.getTime()) },
        { propertyName: 'createdate',          operator: 'LT',  value: String(splyEnd.getTime())   },
        { propertyName: 'hs_analytics_source', operator: 'EQ',  value: 'OFFLINE'                   },
      ] as any }],
      properties: [], limit: 1, after: '0', sorts: [],
    })
    offline = res.total ?? 0
  } catch { /* non-fatal */ }

  return {
    online:  b.icp + b.mcp + b.unidentified,
    icp:     b.icp,
    mcp:     b.mcp,
    offline,
  }
}

/** Return 2026 inbound contact counts grouped by source × profile. */
async function getContactBreakdownImpl(clientSlug: string): Promise<ContactSourceBreakdown> {
  const { bySource } = await load2026InboundContacts(clientSlug)

  return Object.entries(bySource)
    .map(([source, b]) => ({ source, ...b }))
    .sort((a, b) => bucketTotal(b) - bucketTotal(a))
}

export type WeeklyContactStats = {
  weekStart: string
  weekEnd: string
  currentWeekTotal: number
  prevWeekTotal: number
  prevYearWeekTotal: number
  prevQuarterLabel: string
  prevQuarterWeeklyAvg: number
  daysElapsed: number      // working days Mon–today (1–5)
  workingDaysInWeek: number // always 5
  days: {
    label: string
    date: string
    total: number
    icp: number
    mcp: number
    unidentified: number
  }[]
}

function countWorkingDays(start: Date, end: Date): number {
  let count = 0
  const d = new Date(start)
  while (d < end) {
    const dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6) count++
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return count
}

/** Current-week daily breakdown vs previous-quarter working average. */
async function getWeeklyContactStatsImpl(clientSlug: string): Promise<WeeklyContactStats> {
  const hs   = await getHubSpotClient(clientSlug)
  const data = await load2026InboundContacts(clientSlug)

  const today = new Date()
  const dow   = today.getUTCDay()
  const daysFromMon = dow === 0 ? 6 : dow - 1

  const monday = new Date(today)
  monday.setUTCDate(today.getUTCDate() - daysFromMon)
  monday.setUTCHours(0, 0, 0, 0)

  const yr = today.getUTCFullYear()
  const q  = Math.floor(today.getUTCMonth() / 3) + 1
  let pqStart: Date, pqEnd: Date, pqLabel: string
  if (q === 1) {
    pqStart = new Date(Date.UTC(yr - 1, 9, 1))
    pqEnd   = new Date(Date.UTC(yr,     0, 1))
    pqLabel = `Q4 ${yr - 1}`
  } else {
    pqStart = new Date(Date.UTC(yr, (q - 2) * 3, 1))
    pqEnd   = new Date(Date.UTC(yr, (q - 1) * 3, 1))
    pqLabel = `Q${q - 1} ${yr}`
  }
  const pqWorkingWeeks = countWorkingDays(pqStart, pqEnd) / 5

  // Previous quarter total — derived from byMonth cache
  let pqTotal = 0
  const pqCursor = new Date(pqStart)
  while (pqCursor < pqEnd) {
    const mk = `${pqCursor.getUTCFullYear()}-${String(pqCursor.getUTCMonth() + 1).padStart(2, '0')}`
    const b = data.byMonth[mk]
    if (b) pqTotal += bucketTotal(b)
    pqCursor.setUTCMonth(pqCursor.getUTCMonth() + 1)
  }

  // Previous week (Mon–Sun) — still in 2026, so use byDay cache
  const lastMonday = new Date(monday); lastMonday.setUTCDate(monday.getUTCDate() - 7)
  const prevWeekBucket = sumDays(data.byDay, lastMonday, monday)
  const prevWeekTotal  = bucketTotal(prevWeekBucket)

  // Previous year same week — one count query (outside 2026 cache)
  const prevYearMonday    = new Date(monday); prevYearMonday.setUTCFullYear(monday.getUTCFullYear() - 1)
  const prevYearNextMon   = new Date(prevYearMonday); prevYearNextMon.setUTCDate(prevYearMonday.getUTCDate() + 7)
  let prevYearWeekTotal = 0
  try {
    const res = await searchContacts(hs, {
      filterGroups: [{ filters: [
        { propertyName: 'createdate',          operator: 'GTE', value: String(prevYearMonday.getTime()) },
        { propertyName: 'createdate',          operator: 'LT',  value: String(prevYearNextMon.getTime()) },
        { propertyName: 'hs_analytics_source', operator: 'NEQ', value: 'OFFLINE' },
      ] as any }],
      properties: [], limit: 1, after: '0', sorts: [],
    })
    prevYearWeekTotal = res.total ?? 0
  } catch { /* non-fatal */ }

  // Daily buckets from cache
  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const days = DAY_LABELS.map((label, i) => {
    const dayStart = new Date(monday); dayStart.setUTCDate(monday.getUTCDate() + i)
    const dayEnd   = new Date(dayStart); dayEnd.setUTCDate(dayStart.getUTCDate() + 1)
    const b = sumDays(data.byDay, dayStart, dayEnd)
    return { label, date: fmtDate(dayStart), total: bucketTotal(b), ...b }
  })

  const friday = new Date(monday); friday.setUTCDate(monday.getUTCDate() + 4)

  const daysElapsed = Math.min(5, Math.max(1, daysFromMon + 1))

  return {
    weekStart: fmtDate(monday),
    weekEnd:   fmtDate(friday),
    currentWeekTotal: days.reduce((s, d) => s + d.total, 0),
    prevWeekTotal,
    prevYearWeekTotal,
    prevQuarterLabel: pqLabel,
    prevQuarterWeeklyAvg: pqTotal / pqWorkingWeeks,
    daysElapsed,
    workingDaysInWeek: 5,
    days,
  }
}

export type WeeklyYTDEntry = {
  weekLabel: string  // e.g. "Jan 5"
  weekStart: string  // ISO date of Monday, e.g. "2026-01-05"
  icp: number
  mcp: number
  unidentified: number
  total: number
  prevTotal: number  // same week last year (364 days prior)
  prevIcp: number
  prevMcp: number
}

/** All calendar weeks from the start of 2026 through the current week, Mon–Sun. */
async function getWeeklyYTDContactsImpl(clientSlug: string): Promise<WeeklyYTDEntry[]> {
  const [data, prev] = await Promise.all([
    load2026InboundContacts(clientSlug),
    load2025InboundContacts(clientSlug),
  ])

  const today = new Date()
  const isoDate = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

  // Monday of the week containing Jan 1 2026
  const jan1 = new Date(Date.UTC(2026, 0, 1))
  const jan1Dow = jan1.getUTCDay()                            // 0=Sun … 6=Sat
  const offsetToMon = jan1Dow === 0 ? -6 : 1 - jan1Dow       // days back to Monday
  const firstMonday = new Date(jan1)
  firstMonday.setUTCDate(jan1.getUTCDate() + offsetToMon)

  const weeks: WeeklyYTDEntry[] = []
  const cursor = new Date(firstMonday)

  while (cursor <= today) {
    const weekStart = new Date(cursor)
    const weekEnd   = new Date(cursor)
    weekEnd.setUTCDate(cursor.getUTCDate() + 7)

    const b = sumDays(data.byDay, weekStart, weekEnd)
    const total = b.icp + b.mcp + b.unidentified

    // Corresponding prior-year week is exactly 364 days (52 weeks) earlier
    const prevStart = new Date(weekStart)
    prevStart.setUTCDate(prevStart.getUTCDate() - 364)
    const prevEnd = new Date(prevStart)
    prevEnd.setUTCDate(prevStart.getUTCDate() + 7)
    const pb = sumDays(prev.byDay, prevStart, prevEnd)

    // Only include weeks that have at least one contact or are in the past
    if (total > 0 || weekStart < today) {
      const weekLabel = weekStart.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', timeZone: 'UTC',
      })
      weeks.push({
        weekLabel,
        weekStart: isoDate(weekStart),
        icp: b.icp, mcp: b.mcp, unidentified: b.unidentified, total,
        prevTotal: pb.icp + pb.mcp + pb.unidentified,
        prevIcp: pb.icp,
        prevMcp: pb.mcp,
      })
    }

    cursor.setUTCDate(cursor.getUTCDate() + 7)
  }

  return weeks
}

export type MonthlyContactEntry = {
  monthKey: string
  month: string
  icp: number
  mcp: number
  unidentified: number
  total: number
}

export type MonthlyContactResult = {
  months: MonthlyContactEntry[]
  currentMonthTotal: number
  currentMonthLabel: string
  prevMonthTotal: number
  prevYearMonthTotal: number
  prevQuarterMonthlyAvg: number
  prevQuarterLabel: string
  daysElapsed: number      // today's date in the current month
  totalDaysInMonth: number // total calendar days in the current month
}

/** Monthly breakdown of 2026 inbound contacts by profile, plus KPI stats. */
async function getMonthlyContactBreakdownImpl(clientSlug: string): Promise<MonthlyContactResult> {
  const hs   = await getHubSpotClient(clientSlug)
  const data = await load2026InboundContacts(clientSlug)

  const today = new Date()
  const yr    = today.getUTCFullYear()
  const mo    = today.getUTCMonth()

  const months: MonthlyContactEntry[] = Object.entries(data.byMonth)
    .map(([monthKey, b]) => {
      const [y, m] = monthKey.split('-').map(Number)
      const month  = new Date(Date.UTC(y, m - 1, 1))
        .toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
      return { monthKey, month, ...b, total: bucketTotal(b) }
    })
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))

  const mk    = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}`
  const curKey  = mk(yr, mo)
  const prevKey = mo === 0 ? mk(yr - 1, 11) : mk(yr, mo - 1)

  const currentMonthTotal = data.byMonth[curKey]  ? bucketTotal(data.byMonth[curKey])  : 0
  const prevMonthTotal    = data.byMonth[prevKey] ? bucketTotal(data.byMonth[prevKey]) : 0

  const currentMonthLabel = new Date(Date.UTC(yr, mo, 1))
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

  const q = Math.floor(mo / 3) + 1
  let pqLabel: string
  let pqMonthKeys: string[]
  if (q === 1) {
    pqLabel     = `Q4 ${yr - 1}`
    pqMonthKeys = [mk(yr - 1, 9), mk(yr - 1, 10), mk(yr - 1, 11)]
  } else {
    pqLabel     = `Q${q - 1} ${yr}`
    const start = (q - 2) * 3
    pqMonthKeys = [mk(yr, start), mk(yr, start + 1), mk(yr, start + 2)]
  }
  const pqTotal = pqMonthKeys.reduce((sum, k) => sum + (data.byMonth[k] ? bucketTotal(data.byMonth[k]) : 0), 0)

  // Prior year same month — one count query outside 2026
  const pyStart = new Date(Date.UTC(yr - 1, mo, 1))
  const pyEnd   = new Date(Date.UTC(yr - 1, mo + 1, 1))
  let prevYearMonthTotal = 0
  try {
    const res = await searchContacts(hs, {
      filterGroups: [{ filters: [
        { propertyName: 'createdate',          operator: 'GTE', value: String(pyStart.getTime()) },
        { propertyName: 'createdate',          operator: 'LT',  value: String(pyEnd.getTime())   },
        { propertyName: 'hs_analytics_source', operator: 'NEQ', value: 'OFFLINE'                 },
      ] as any }],
      properties: [], limit: 1, after: '0', sorts: [],
    })
    prevYearMonthTotal = res.total ?? 0
  } catch { /* non-fatal */ }

  const daysElapsed = today.getUTCDate()
  const totalDaysInMonth = new Date(Date.UTC(yr, mo + 1, 0)).getUTCDate()

  return {
    months,
    currentMonthTotal,
    currentMonthLabel,
    prevMonthTotal,
    prevYearMonthTotal,
    prevQuarterMonthlyAvg: pqTotal / 3,
    prevQuarterLabel: pqLabel,
    daysElapsed,
    totalDaysInMonth,
  }
}

// ── Quarterly pacing ────────────────────────────────────────────────────────

export type QuarterlyContactEntry = {
  quarterKey: string   // e.g. "2026-Q2"
  label:      string   // e.g. "Q2 2026"
  icp:          number
  mcp:          number
  unidentified: number
  total:        number
}

export type QuarterlyContactResult = {
  quarters:               QuarterlyContactEntry[]
  currentQuarterLabel:    string
  currentQuarterTotal:    number
  prevQuarterTotal:       number
  prevYearQuarterTotal:   number
  daysElapsed:            number   // days into current quarter (1-based)
  totalDaysInQuarter:     number
}

async function getQuarterlyContactStatsImpl(clientSlug: string): Promise<QuarterlyContactResult> {
  const [data2026, data2025] = await Promise.all([
    load2026InboundContacts(clientSlug),
    load2025InboundContacts(clientSlug),
  ])

  const today = new Date()
  const yr    = today.getUTCFullYear()
  const mo    = today.getUTCMonth()           // 0-based
  const q     = Math.floor(mo / 3) + 1       // 1–4

  const mk = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}`

  const qMonths = (qNum: number): number[] => {
    const s = (qNum - 1) * 3
    return [s, s + 1, s + 2]
  }

  const sumQuarter = (year: number, qNum: number, cache: typeof data2026): QuarterlyContactEntry => {
    let icp = 0, mcp = 0, unidentified = 0
    for (const m of qMonths(qNum)) {
      const b = cache.byMonth[mk(year, m)]
      if (b) { icp += b.icp; mcp += b.mcp; unidentified += b.unidentified }
    }
    return { quarterKey: `${year}-Q${qNum}`, label: `Q${qNum} ${year}`, icp, mcp, unidentified, total: icp + mcp + unidentified }
  }

  // All quarters in current year to date
  const quarters: QuarterlyContactEntry[] = []
  for (let qi = 1; qi <= q; qi++) {
    quarters.push(sumQuarter(yr, qi, data2026))
  }

  const currentQuarterTotal = quarters[q - 1]?.total ?? 0
  const currentQuarterLabel = `Q${q} ${yr}`

  // Previous quarter — may cross into prior year
  let prevQuarterTotal = 0
  if (q === 1) {
    prevQuarterTotal = sumQuarter(yr - 1, 4, data2025).total
  } else {
    prevQuarterTotal = sumQuarter(yr, q - 1, data2026).total
  }

  // Prior year same quarter (from 2025 cache)
  const prevYearQuarterTotal = sumQuarter(yr - 1, q, data2025).total

  // Pacing
  const qStartMonth  = (q - 1) * 3
  const qStart       = new Date(Date.UTC(yr, qStartMonth,     1))
  const qEnd         = new Date(Date.UTC(yr, qStartMonth + 3, 1))
  const msPerDay     = 86_400_000
  const totalDaysInQuarter = Math.round((qEnd.getTime() - qStart.getTime()) / msPerDay)
  const daysElapsed  = Math.min(
    totalDaysInQuarter,
    Math.floor((today.getTime() - qStart.getTime()) / msPerDay) + 1,
  )

  return {
    quarters,
    currentQuarterLabel,
    currentQuarterTotal,
    prevQuarterTotal,
    prevYearQuarterTotal,
    daysElapsed,
    totalDaysInQuarter,
  }
}

export type YearlyContactStats = {
  currentYear: number
  currentYearLabel: string       // e.g. "2026"
  currentYearTotal: number       // YTD
  samePeriodLastYearTotal: number
  fullLastYearTotal: number
  fullPrevPrevYearTotal: number
  daysElapsed: number            // day-of-year (1–365)
  totalDaysInYear: number
  remainingMonths: number        // calendar months left including current (e.g. May = 8)
}

/** Current YTD vs same period last year, full last year, and full year before that. */
async function getYearlyContactStatsImpl(clientSlug: string): Promise<YearlyContactStats> {
  const hs   = await getHubSpotClient(clientSlug)
  const data = await load2026InboundContacts(clientSlug)

  const today = new Date()
  const yr    = today.getUTCFullYear()
  const mo    = today.getUTCMonth()
  const day   = today.getUTCDate()

  // Day of year (1-based)
  const yearStart    = new Date(Date.UTC(yr, 0, 1))
  const msPerDay     = 86400000
  const daysElapsed  = Math.floor((today.getTime() - yearStart.getTime()) / msPerDay) + 1
  const isLeap       = (y: number) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)
  const totalDaysInYear = isLeap(yr) ? 366 : 365

  const currentYearTotal = data.total

  // Same calendar date last year (exclusive end = day after)
  const splyStart = new Date(Date.UTC(yr - 1, 0,  1))
  const splyEnd   = new Date(Date.UTC(yr - 1, mo, day + 1))

  // Full last year
  const ly1Start  = new Date(Date.UTC(yr - 1, 0, 1))
  const ly1End    = new Date(Date.UTC(yr,     0, 1))

  // Full year before that
  const ly2Start  = new Date(Date.UTC(yr - 2, 0, 1))
  const ly2End    = new Date(Date.UTC(yr - 1, 0, 1))

  const countContacts = async (start: Date, end: Date): Promise<number> => {
    try {
      const res = await searchContacts(hs, {
        filterGroups: [{ filters: [
          { propertyName: 'createdate',          operator: 'GTE', value: String(start.getTime()) },
          { propertyName: 'createdate',          operator: 'LT',  value: String(end.getTime())   },
          { propertyName: 'hs_analytics_source', operator: 'NEQ', value: 'OFFLINE'               },
        ] as any }],
        properties: [], limit: 1, after: '0', sorts: [],
      })
      return res.total ?? 0
    } catch { return 0 }
  }

  const [samePeriodLastYearTotal, fullLastYearTotal, fullPrevPrevYearTotal] = await Promise.all([
    countContacts(splyStart, splyEnd),
    countContacts(ly1Start,  ly1End),
    countContacts(ly2Start,  ly2End),
  ])

  const remainingMonths = 13 - (mo + 1) // months left including current (May=8, Dec=1)

  return {
    currentYear: yr,
    currentYearLabel: String(yr),
    currentYearTotal,
    samePeriodLastYearTotal,
    fullLastYearTotal,
    fullPrevPrevYearTotal,
    daysElapsed,
    totalDaysInYear,
    remainingMonths,
  }
}

export interface DailyContactEntry {
  date:  string  // "Apr 7"
  total: number
  icp:   number
  mcp:   number
}

/**
 * Returns a daily contact-creation series for the given ISO date range.
 * Reuses the load2026/load2025 caches — no extra pagination per request.
 */
async function getDailyContactTrendImpl(
  clientSlug: string,
  startDate: string,  // "2026-04-07"
  endDate:   string,  // "2026-05-07"
): Promise<DailyContactEntry[]> {
  const start = new Date(`${startDate}T00:00:00Z`)
  const end   = new Date(`${endDate}T00:00:00Z`)

  // Determine which year caches we need
  const needsY2025 = start.getUTCFullYear() <= 2025
  const needsY2026 = end.getUTCFullYear()   >= 2026

  const [data2025, data2026] = await Promise.all([
    needsY2025 ? load2025InboundContacts(clientSlug) : Promise.resolve(null),
    needsY2026 ? load2026InboundContacts(clientSlug) : Promise.resolve(null),
  ])

  const lookup = (dayKey: string): { icp: number; mcp: number; unidentified: number } => {
    const year = parseInt(dayKey.slice(0, 4))
    const map  = year <= 2025 ? data2025?.byDay : data2026?.byDay
    return map?.[dayKey] ?? { icp: 0, mcp: 0, unidentified: 0 }
  }

  const result: DailyContactEntry[] = []
  const cur = new Date(start)
  while (cur <= end) {
    const y  = cur.getUTCFullYear()
    const mo = String(cur.getUTCMonth() + 1).padStart(2, '0')
    const d  = String(cur.getUTCDate()).padStart(2, '0')
    const key  = `${y}-${mo}-${d}`
    const b    = lookup(key)
    const label = cur.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    result.push({ date: label, total: b.icp + b.mcp + b.unidentified, icp: b.icp, mcp: b.mcp })
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return result
}

/**
 * Contact counts for an arbitrary ISO date range.
 * Online/ICP/MCP come from the cached byDay buckets — no extra pagination.
 * Offline requires a live count query (not in the day cache).
 */
async function getContactStatsForRangeImpl(
  clientSlug: string,
  startDate:  string,  // "2026-04-07"
  endDate:    string,  // "2026-05-07" inclusive
) {
  const start    = new Date(`${startDate}T00:00:00Z`)
  const endExcl  = new Date(`${endDate}T00:00:00Z`)
  endExcl.setUTCDate(endExcl.getUTCDate() + 1)

  const needsY2025 = start.getUTCFullYear() <= 2025
  const needsY2026 = endExcl.getUTCFullYear() >= 2026

  const [data2025, data2026] = await Promise.all([
    needsY2025 ? load2025InboundContacts(clientSlug) : Promise.resolve(null),
    needsY2026 ? load2026InboundContacts(clientSlug) : Promise.resolve(null),
  ])

  let online = 0, icp = 0, mcp = 0
  const cur = new Date(start)
  while (cur < endExcl) {
    const y   = cur.getUTCFullYear()
    const mo  = String(cur.getUTCMonth() + 1).padStart(2, '0')
    const d   = String(cur.getUTCDate()).padStart(2, '0')
    const key   = `${y}-${mo}-${d}`
    const byDay = y <= 2025 ? data2025?.byDay : data2026?.byDay
    const b = byDay?.[key]
    if (b) { online += b.icp + b.mcp + b.unidentified; icp += b.icp; mcp += b.mcp }
    cur.setUTCDate(cur.getUTCDate() + 1)
  }

  const hs = await getHubSpotClient(clientSlug)
  let offline: number | null = null
  try {
    const res = await searchContacts(hs, {
      filterGroups: [{ filters: [
        { propertyName: 'createdate',          operator: 'GTE', value: String(start.getTime())   },
        { propertyName: 'createdate',          operator: 'LT',  value: String(endExcl.getTime()) },
        { propertyName: 'hs_analytics_source', operator: 'EQ',  value: 'OFFLINE'                 },
      ] as any }],
      properties: [], limit: 1, after: '0', sorts: [],
    })
    offline = res.total ?? 0
  } catch { /* non-fatal */ }

  return { online, icp, mcp, offline }
}

/** Fetch total contact and deal counts plus recent closed-won deals. */
async function getHubSpotSummaryImpl(clientSlug: string) {
  const hs = await getHubSpotClient(clientSlug)

  const [contactsRes, dealsRes, closedDealsRes] = await Promise.all([
    searchContacts(hs, { filterGroups: [], properties: [], limit: 1, after: '0', sorts: [] }),
    searchDeals(hs, { filterGroups: [], properties: [], limit: 1, after: '0', sorts: [] }),
    searchDeals(hs, {
      filterGroups: [{ filters: [{ propertyName: 'dealstage', operator: DealFilterOp.Eq, value: 'closedwon' }] }],
      properties: ['dealname', 'amount', 'closedate', 'dealstage'],
      limit: 10,
      after: '0',
      sorts: ['-closedate'],
    }),
  ])

  return {
    totalContacts: contactsRes.total ?? 0,
    totalDeals: dealsRes.total ?? 0,
    recentClosedDeals: closedDealsRes.results ?? [],
  }
}

// ── Form analytics ──────────────────────────────────────────────────────────

export interface FormPerformanceEntry {
  formName:     string
  total:        number
  icp:          number
  mcp:          number
  unidentified: number
}

/**
 * Per-form submission counts for a date range.
 * Derives data from the year-level caches (no extra API calls) using the
 * byDayForm buckets populated during the full-year contact pagination.
 */
const loadFormContactsForRange = cache(async (
  clientSlug: string,
  startDate:  string,
  endDate:    string,
): Promise<{
  byForm:    Record<string, ProfileBucket>
  byDayForm: Record<string, Record<string, number>>
}> => {
  const start      = new Date(`${startDate}T00:00:00Z`)
  const endActual  = new Date(`${endDate}T00:00:00Z`)   // inclusive last day
  const endIncl    = new Date(endActual)
  endIncl.setUTCDate(endIncl.getUTCDate() + 1)           // exclusive upper bound

  // Use endActual (not endIncl) so "last year" (ends 2025-12-31) doesn't
  // trigger an unnecessary load of the 2026 cache.
  const needsY2025 = start.getUTCFullYear() <= 2025
  const needsY2026 = endActual.getUTCFullYear() >= 2026

  const [d2025, d2026] = await Promise.all([
    needsY2025 ? load2025InboundContacts(clientSlug) : Promise.resolve(null),
    needsY2026 ? load2026InboundContacts(clientSlug) : Promise.resolve(null),
  ])

  const byForm:    Record<string, ProfileBucket>           = {}
  const byDayForm: Record<string, Record<string, number>>  = {}

  const cur = new Date(start)
  while (cur < endIncl) {
    const y  = cur.getUTCFullYear()
    const mo = String(cur.getUTCMonth() + 1).padStart(2, '0')
    const dy = String(cur.getUTCDate()).padStart(2, '0')
    const key = `${y}-${mo}-${dy}`

    const yearData  = y <= 2025 ? d2025 : d2026
    const dayForms  = yearData?.byDayForm?.[key] ?? {}

    for (const [formName, bucket] of Object.entries(dayForms)) {
      if (!byForm[formName]) byForm[formName] = { icp: 0, mcp: 0, unidentified: 0 }
      byForm[formName].icp          += bucket.icp
      byForm[formName].mcp          += bucket.mcp
      byForm[formName].unidentified += bucket.unidentified

      if (!byDayForm[key]) byDayForm[key] = {}
      byDayForm[key][formName] = (byDayForm[key][formName] ?? 0)
        + bucket.icp + bucket.mcp + bucket.unidentified
    }

    cur.setUTCDate(cur.getUTCDate() + 1)
  }

  return { byForm, byDayForm }
})

async function getFormBreakdownImpl(
  clientSlug: string,
  startDate:  string,
  endDate:    string,
): Promise<FormPerformanceEntry[]> {
  const { byForm } = await loadFormContactsForRange(clientSlug, startDate, endDate)
  return Object.entries(byForm)
    .filter(([formName]) => formName !== '(Direct / Unknown)')
    .map(([formName, b]) => ({ formName, ...b, total: b.icp + b.mcp + b.unidentified }))
    .sort((a, b) => b.total - a.total)
}

export interface DailyFormEntry {
  date:  string
  forms: Record<string, number>
}

async function getDailyFormTrendImpl(
  clientSlug: string,
  startDate:  string,
  endDate:    string,
  topN = 6,
): Promise<{ topForms: string[]; days: DailyFormEntry[] }> {
  const { byForm, byDayForm } = await loadFormContactsForRange(clientSlug, startDate, endDate)

  // Top forms by volume, excluding the catch-all (unless it's the only one)
  let topForms = Object.entries(byForm)
    .filter(([name]) => name !== '(Direct / Unknown)')
    .sort(([, a], [, b]) => (b.icp + b.mcp + b.unidentified) - (a.icp + a.mcp + a.unidentified))
    .slice(0, topN)
    .map(([name]) => name)

  if (topForms.length === 0) {
    topForms = Object.entries(byForm)
      .sort(([, a], [, b]) => (b.icp + b.mcp + b.unidentified) - (a.icp + a.mcp + a.unidentified))
      .slice(0, topN)
      .map(([name]) => name)
  }

  const start = new Date(`${startDate}T00:00:00Z`)
  const end   = new Date(`${endDate}T00:00:00Z`)
  const days: DailyFormEntry[] = []
  const cur = new Date(start)

  while (cur <= end) {
    const y  = cur.getUTCFullYear()
    const mo = String(cur.getUTCMonth() + 1).padStart(2, '0')
    const d  = String(cur.getUTCDate()).padStart(2, '0')
    const key   = `${y}-${mo}-${d}`
    const label = cur.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    const dayForms = byDayForm[key] ?? {}
    const forms: Record<string, number> = {}
    for (const f of topForms) forms[f] = dayForms[f] ?? 0
    days.push({ date: label, forms })
    cur.setUTCDate(cur.getUTCDate() + 1)
  }

  return { topForms, days }
}

// ── Lifecycle stage counts ──────────────────────────────────────────────────

export interface LifecycleStageCount {
  stage: string
  label: string
  total: number
}

const LIFECYCLE_STAGES: { stage: string; label: string }[] = [
  { stage: 'subscriber',             label: 'Subscriber'  },
  { stage: 'lead',                   label: 'Lead'        },
  { stage: 'marketingqualifiedlead', label: 'MQL'         },
  { stage: 'salesqualifiedlead',     label: 'SQL'         },
  { stage: 'opportunity',            label: 'Opportunity' },
  { stage: 'customer',               label: 'Customer'    },
]

async function getLifecycleStageCountsImpl(
  clientSlug: string,
  startDate:  string,
  endDate:    string,
): Promise<LifecycleStageCount[]> {
  const hs      = await getHubSpotClient(clientSlug)
  const start   = new Date(`${startDate}T00:00:00Z`)
  const endIncl = new Date(`${endDate}T00:00:00Z`)
  endIncl.setUTCDate(endIncl.getUTCDate() + 1)

  // One count query per stage, fired concurrently — the search-API limiter
  // (hsRate) spaces them under the 4 req/s quota. Promise.all preserves order.
  return Promise.all(
    LIFECYCLE_STAGES.map(async ({ stage, label }): Promise<LifecycleStageCount> => {
      let total = 0
      try {
        const res = await searchContacts(hs, {
          filterGroups: [{ filters: [
            { propertyName: 'createdate',     operator: 'GTE', value: String(start.getTime())   },
            { propertyName: 'createdate',     operator: 'LT',  value: String(endIncl.getTime()) },
            { propertyName: 'lifecyclestage', operator: 'EQ',  value: stage                     },
          ] as any }],
          properties: [], limit: 1, after: '0', sorts: [],
        })
        total = res.total ?? 0
      } catch { /* non-fatal */ }
      return { stage, label, total }
    }),
  )
}

// ── Form metadata (requires `forms` scope) ─────────────────────────────────

export interface FormMetaEntry {
  id:        string
  name:      string
  createdAt: Date
}

async function getFormMetadataImpl(clientSlug: string): Promise<FormMetaEntry[]> {
  const hs = await getHubSpotClient(clientSlug)
  const forms: FormMetaEntry[] = []
  let after: string | undefined
  try {
    do {
      const res = await hs.marketing.forms.formsApi.getPage(after, 100, false, ['hubspot'])
      for (const f of (res.results as any[]) ?? []) {
        forms.push({ id: f.id, name: f.name, createdAt: f.createdAt })
      }
      after = (res as any).paging?.next?.after
    } while (after)
  } catch { /* non-fatal if scope not granted */ }
  return forms.sort((a, b) => a.name.localeCompare(b.name))
}

// ── Form submission counts + contact quality layer ──────────────────────────

export interface FormSubmissionCount {
  formId:       string
  formName:     string
  total:        number   // raw form fills (form submissions API)
  icp:          number   // contacts with ICP profile who submitted this form
  mcp:          number   // contacts with MCP profile who submitted this form
  unidentified: number   // contacts with no ICP/MCP profile
  customers:    number   // contacts with lifecyclestage = customer
}

/**
 * Pass 1 — submissions (parallel): fetches all forms simultaneously, counts
 *   fills in the date range, and extracts the submitter email from each
 *   submission's values array. Email is used instead of contactVid because
 *   contactVid is unreliably populated across HubSpot portal versions.
 *
 * Pass 2 — quality (batch): uses the CRM batch-read endpoint (idProperty=email)
 *   to fetch contact profiles in chunks of 100. Maps ICP/MCP back to each form.
 *
 * Wrapped in React cache() so multiple callers in the same request share one
 * execution — no duplicate API calls.
 */
const getFormSubmissionCountsImpl = async (
  clientSlug: string,
  startDate:  string,
  endDate:    string,
): Promise<FormSubmissionCount[]> => {
  const config = await getClientBySlug(clientSlug)
  if (!config?.hubspotTokenEnvVar) return []
  const token = process.env[config.hubspotTokenEnvVar]
  if (!token) return []

  const forms = await getFormMetadata(clientSlug)
  if (forms.length === 0) return []

  const startMs = new Date(`${startDate}T00:00:00Z`).getTime()
  const endMs   = new Date(`${endDate}T23:59:59Z`).getTime()

  // ── Pass 1: submissions — all forms in parallel ────────────────────────────
  async function fetchFormSubmissions(formId: string) {
    const result = { total: 0, emails: new Set<string>() }
    let offset = 0
    let done   = false
    while (!done) {
      let data: any
      try {
        const res = await fetch(
          `https://api.hubapi.com/form-integrations/v1/submissions/forms/${formId}` +
          `?limit=50&offset=${offset}`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (!res.ok) break
        data = await res.json()
      } catch { break }

      const subs: any[] = data.results ?? []
      for (const sub of subs) {
        const ts = sub.submittedAt as number
        if (ts > endMs)   continue
        if (ts < startMs) { done = true; break }
        result.total++
        // Extract email from the submission's field values array
        const emailField = (sub.values as any[])?.find(
          (v: any) => typeof v?.name === 'string' && v.name.toLowerCase() === 'email'
        )
        const email = emailField?.value
        if (email) result.emails.add(String(email).toLowerCase())
      }
      if (!done) {
        done = !data.hasMore
        offset += subs.length
      }
    }
    return result
  }

  const formResults = await Promise.all(forms.map((f) => fetchFormSubmissions(f.id)))

  const byForm: Record<string, { total: number; emails: Set<string> }> = {}
  for (let i = 0; i < forms.length; i++) {
    if (formResults[i].total > 0) byForm[forms[i].id] = formResults[i]
  }

  // ── Pass 2a: fetch all customer emails via EQ query (reliable) ───────────
  const customerEmails = new Set<string>()
  try {
    const hsCust = await getHubSpotClient(clientSlug)
    let afterCust = '0'
    let custPage  = 0
    do {
      const res = await searchContacts(hsCust, {
        filterGroups: [{
          filters: [{ propertyName: 'lifecyclestage', operator: 'EQ', value: 'customer' } as any],
        }],
        properties: ['email'],
        limit:      100,
        after:      afterCust,
        sorts:      [],
      })
      custPage++
      console.log(`[forms-debug] customer page ${custPage}: ${res.results?.length ?? 0} results, total=${res.total}`)
      for (const c of res.results ?? []) {
        const email = (c.properties as Record<string, string | null>).email
        if (email) customerEmails.add(email.toLowerCase())
      }
      afterCust = res.paging?.next?.after ?? ''
    } while (afterCust)
    console.log(`[forms-debug] customerEmails total: ${customerEmails.size}`)
  } catch (e) {
    console.error('[getFormSubmissionCounts] customer email fetch failed:', e)
  }

  // ── Pass 2b: ICP/MCP lookup via email IN ─────────────────────────────────
  const allEmails = Array.from(
    new Set(Object.values(byForm).flatMap((f) => Array.from(f.emails)))
  )
  console.log(`[forms-debug] unique submitter emails: ${allEmails.length}`)
  console.log(`[forms-debug] sample emails: ${allEmails.slice(0, 3).join(', ')}`)
  console.log(`[forms-debug] sample customer emails: ${[...customerEmails].slice(0, 3).join(', ')}`)

  // email (lowercase) → { isIcp, isMcp }
  const profiles: Record<string, { isIcp: boolean; isMcp: boolean }> = {}

  if (allEmails.length > 0) {
    const hs = await getHubSpotClient(clientSlug)
    for (let i = 0; i < allEmails.length; i += 100) {
      const chunk = allEmails.slice(i, i + 100)
      try {
        const res = await searchContacts(hs, {
          filterGroups: [{
            filters: [{
              propertyName: 'email',
              operator:     'IN' as any,
              values:       chunk,
            } as any],
          }],
          properties: ['email', 'profile'],
          limit:      100,
          after:      '0',
          sorts:      [],
        })
        console.log(`[forms-debug] IN query chunk[${i}..${i+chunk.length}]: ${res.results?.length ?? 0} matched`)
        for (const contact of res.results ?? []) {
          const props = contact.properties as Record<string, string | null>
          const email = props.email
          if (!email) continue
          const p     = props.profile ?? ''
          profiles[email.toLowerCase()] = {
            isIcp: p.includes('ICP'),
            isMcp: !p.includes('ICP') && p.includes('MCP'),
          }
        }
      } catch (e) {
        console.error('[getFormSubmissionCounts] profile IN query failed:', e)
      }
    }
  }

  // ── Merge & return ─────────────────────────────────────────────────────────
  return forms
    .filter((f) => byForm[f.id])
    .map((f) => {
      const fd = byForm[f.id]
      let icp = 0, mcp = 0, unidentified = 0, customers = 0
      for (const email of fd.emails) {
        const p = profiles[email]
        if (!p)           unidentified++
        else if (p.isIcp) icp++
        else if (p.isMcp) mcp++
        else              unidentified++
        if (customerEmails.has(email)) customers++
      }
      return { formId: f.id, formName: f.name, total: fd.total, icp, mcp, unidentified, customers }
    })
    .sort((a, b) => b.total - a.total)
}

// --- Cache wrappers ---
// All 18 HubSpot fetchers below take `clientSlug` as their first arg, so
// they share the typed `byClient` extractor from lib/perf. If you add a
// wrap for a function whose first arg is NOT the client slug, write a
// per-call extractor inline instead — don't extend byClient.
//
// `getHubSpotClient` is intentionally NOT wrapped: it returns the SDK
// instance (memoized in module-scope _clients Map), not a data fetch.
export const getHubSpotClient = getHubSpotClientImpl  // not cached; SDK constructor

export const getPipelineDeals = cached('hubspot', 'getPipelineDeals', getPipelineDealsImpl, { extractTags: byClient })
export const getOwnerMap = cached('hubspot', 'getOwnerMap', getOwnerMapImpl, { extractTags: byClient })
export const getContactStats = cached('hubspot', 'getContactStats', getContactStatsImpl, { extractTags: byClient })
export const getContactStatsYoY = cached('hubspot', 'getContactStatsYoY', getContactStatsYoYImpl, { extractTags: byClient })
export const getContactBreakdown = cached('hubspot', 'getContactBreakdown', getContactBreakdownImpl, { extractTags: byClient })
export const getWeeklyContactStats = cached('hubspot', 'getWeeklyContactStats', getWeeklyContactStatsImpl, { extractTags: byClient })
export const getWeeklyYTDContacts = cached('hubspot', 'getWeeklyYTDContacts', getWeeklyYTDContactsImpl, { extractTags: byClient })
export const getMonthlyContactBreakdown = cached('hubspot', 'getMonthlyContactBreakdown', getMonthlyContactBreakdownImpl, { extractTags: byClient })
export const getQuarterlyContactStats = cached('hubspot', 'getQuarterlyContactStats', getQuarterlyContactStatsImpl, { extractTags: byClient })
export const getYearlyContactStats = cached('hubspot', 'getYearlyContactStats', getYearlyContactStatsImpl, { extractTags: byClient })
export const getDailyContactTrend = cached('hubspot', 'getDailyContactTrend', getDailyContactTrendImpl, { extractTags: byClient })
export const getContactStatsForRange = cached('hubspot', 'getContactStatsForRange', getContactStatsForRangeImpl, { extractTags: byClient })
export const getHubSpotSummary = cached('hubspot', 'getSummary', getHubSpotSummaryImpl, { extractTags: byClient })
export const getFormBreakdown = cached('hubspot', 'getFormBreakdown', getFormBreakdownImpl, { extractTags: byClient })
export const getDailyFormTrend = cached('hubspot', 'getDailyFormTrend', getDailyFormTrendImpl, { extractTags: byClient })
export const getLifecycleStageCounts = cached('hubspot', 'getLifecycleStageCounts', getLifecycleStageCountsImpl, { extractTags: byClient })
export const getFormMetadata = cached('hubspot', 'getFormMetadata', getFormMetadataImpl, { extractTags: byClient })
export const getFormSubmissionCounts = cached('hubspot', 'getFormSubmissionCounts', getFormSubmissionCountsImpl, { extractTags: byClient })
