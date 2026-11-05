// The lock sweep (D27): the hourly cache warmer renders every Organic Social tab of the two most
// recently locked months, oldest first, as the team, so a month's numbers are all captured in one run
// on its lock day. Pure. Tabs come from the same helper the sidebar uses, so a new channel is swept
// with no code change.
//
// Only from a month's lock day through SWEEP_DAYS after it: the extra days retry a capture Dash
// failed on the day itself. Past that every answer is stored, and an hourly render only re-reads
// the stored answers from Neon, which used up the project's monthly network transfer in October.
import { organicSocialSubsections } from '@/lib/constants'
import type { Client } from '@/lib/db/schema'
import { firstOf, hasReportingMonths, lastOf, monthOf, opensOn, parseReportingMonths } from './reporting-months'
import { lockOn, parseLockDay, settledThrough } from './lock-day'

const SWEEP_DAYS = 2

const prevKey = (key: string) => monthOf(new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 0)).toISOString().slice(0, 10))
const addDays = (day: string, n: number) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

export function lockSweepUrls(baseUrl: string, client: Client, today: string): string[] {
  if (!hasReportingMonths(client) || !client.enabledReports.includes('organic-social')) return []
  const rm = (client.dashSocialConfig as { reportingMonths?: unknown }).reportingMonths
  const parsed = parseReportingMonths(rm)
  const settled = settledThrough(rm, today)
  if (!parsed.ok || !settled) return []
  const newest = monthOf(settled)
  const { lockDay } = parseLockDay(rm)
  const sweeping = (m: string) => today <= addDays(lockOn(m, lockDay, opensOn(m, parsed.cfg.opensOnDay, parsed.cfg.weekendRule)), SWEEP_DAYS)
  const months = [prevKey(newest), newest].filter((m) => m >= parsed.cfg.firstMonth && sweeping(m))
  const tabs = organicSocialSubsections(client)
  return months.flatMap((m) => {
    const range = encodeURIComponent(`custom:${firstOf(m)},${lastOf(m)}`)
    return tabs.map((t) => `${baseUrl}/dashboard/${client.slug}/reports?section=organic-social${t.id ? `&subsection=${t.id}` : ''}&dateRange=${range}`)
  })
}
