// The lock sweep (D27): the hourly cache warmer renders every Organic Social tab of the two most
// recently locked months, oldest first, as the team, so a month's numbers are all captured in one run
// on its lock day. Pure. Tabs come from the same helper the sidebar uses, so a new channel is swept
// with no code change.
import { organicSocialSubsections } from '@/lib/constants'
import type { Client } from '@/lib/db/schema'
import { firstOf, hasReportingMonths, lastOf, monthOf, parseReportingMonths } from './reporting-months'
import { settledThrough } from './lock-day'

const prevKey = (key: string) => monthOf(new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 0)).toISOString().slice(0, 10))

export function lockSweepUrls(baseUrl: string, client: Client, today: string): string[] {
  if (!hasReportingMonths(client) || !client.enabledReports.includes('organic-social')) return []
  const rm = (client.dashSocialConfig as { reportingMonths?: unknown }).reportingMonths
  const parsed = parseReportingMonths(rm)
  const settled = settledThrough(rm, today)
  if (!parsed.ok || !settled) return []
  const newest = monthOf(settled)
  const months = [prevKey(newest), newest].filter((m) => m >= parsed.cfg.firstMonth)
  const tabs = organicSocialSubsections(client)
  return months.flatMap((m) => {
    const range = encodeURIComponent(`custom:${firstOf(m)},${lastOf(m)}`)
    return tabs.map((t) => `${baseUrl}/dashboard/${client.slug}/reports?section=organic-social${t.id ? `&subsection=${t.id}` : ''}&dateRange=${range}`)
  })
}
