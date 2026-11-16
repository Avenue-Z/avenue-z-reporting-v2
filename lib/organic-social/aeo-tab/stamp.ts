// lib/organic-social/aeo-tab/stamp.ts
// The PDF export's period stamp for the AEO Informed Social tab: the window actually rendered (spec 2026-11-12 section 4), in the date
// format every other stamp uses (exportPeriodLabel, lib/export-period.ts). Pure.
import { exportPeriodLabel } from '@/lib/export-period'
import type { Clock } from '@/lib/organic-social/reporting-months'
import { AEO_RANGE_LABEL, aeoWindow, type AeoRange } from './params'
import { parseAeoInformedSetting } from './setting'

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** The range ("YTD"), a comma, then its window in exportPeriodLabel's date format. */
export function aeoStampLabel(range: AeoRange, window: { start: string; end: string }): string | null {
  const dates = exportPeriodLabel(`custom:${window.start},${window.end}`)
  return dates === null ? null : `${AEO_RANGE_LABEL[range]}, ${dates}`
}

/** The stamp for the tab as the section renders it: the same window (aeoWindow, the same clock). With no window to show (no setting, a month
 *  not started, before the first data day, an unreadable range) it is the served range's own stamp, as for every other tab. */
export function aeoExportPeriodLabel(a: { client: { dashSocialConfig?: unknown }; servedRange: string; range: AeoRange; clock: Clock }): string | null {
  const parsed = parseAeoInformedSetting((a.client.dashSocialConfig as { aeoInformedSocial?: unknown } | null | undefined)?.aeoInformedSocial)
  if (parsed.kind !== 'ok') return exportPeriodLabel(a.servedRange)
  try {
    const w = aeoWindow({ servedRange: a.servedRange, range: a.range, allTimeFrom: parsed.setting.allTimeFrom, today: addDays(a.clock.lastCompleteUtcDay, 1) })
    return w.kind === 'ok' ? aeoStampLabel(a.range, w.window) : exportPeriodLabel(a.servedRange)
  } catch {
    return exportPeriodLabel(a.servedRange)
  }
}
