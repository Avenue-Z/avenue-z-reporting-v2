import { formatResolvedRange } from './date-range'

/** The reporting period stamped on an exported PDF, or null when the range can't be read.
 *  dateRange is a URL param and this runs in the page, outside the sections' error boundaries,
 *  so a malformed one must cost the stamp its period, not the page. */
export function exportPeriodLabel(dateRange: string): string | null {
  try {
    return formatResolvedRange(dateRange)
  } catch {
    return null
  }
}
