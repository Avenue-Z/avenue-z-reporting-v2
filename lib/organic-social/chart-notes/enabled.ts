import { hasReportingMonths } from '../reporting-months'

/** Written notes on the v2 graphs are on for a client on locked months (the October set), or for a live client whose
 *  dash_social_config.chartNotes is exactly true (Renaissance, PR #306; Paul approved it 2026-10-02).
 *  Synchronous, no I/O. A client with a reportingMonths key follows the locked-months rules even if chartNotes is set. */
export function notesOn(client: unknown): boolean {
  if (hasReportingMonths(client)) return true
  const cfg = typeof client === 'object' && client !== null ? (client as { dashSocialConfig?: unknown }).dashSocialConfig : undefined
  return typeof cfg === 'object' && cfg !== null && !Array.isArray(cfg) && (cfg as Record<string, unknown>).chartNotes === true
}
