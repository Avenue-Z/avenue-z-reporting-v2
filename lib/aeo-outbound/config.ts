// Ryan's answers to the spec's §13 questions (docs/superpowers/specs/2026-10-08-aeo-outbound-snapshot-design.md).
// Each default is the spec's assumption. When he answers, change the value here and nowhere else.
export const DECISIONS = {
  /** Q1: titles of the two data sections, first (strengths) then second (gaps). */
  sectionTitles: ['Category data', 'Competitive visibility'] as readonly [string, string],
  /** Q3: Glean writes a more specific category instead of using Peec's `industry`. */
  writeSpecificCategory: false as boolean,
  /** Q5: how many of the three opportunities come from Peec actions when any exist. */
  peecOpportunityRows: 1 as number,
  /** Q6: the methodology states the prompt count and the models covered. */
  methodologyStatesPromptsAndModels: true as boolean,
  /** Q7: one fixed next-step sentence for every report, or null for one written per brand. */
  fixedNextStep: null as string | null,
  /** Q8: Approve stays disabled while any slot still says "Needs validation". */
  needsValidationBlocksApprove: true as boolean,
  /** Q9: only PITCH and PITCH_ENDED projects can be used. */
  pitchOnly: true as boolean,
  /** Q10: the sidebar wordmark reads "AIVx", as on AIVx reports. */
  showAivxName: true as boolean,
}
export const PITCH_STATUSES: readonly string[] = ['PITCH', 'PITCH_ENDED']
export const NEEDS_VALIDATION = 'Needs validation'
export const GENERATION_DEADLINE_MS = 270_000
export const STALE_GENERATING_MS = 6 * 60_000
