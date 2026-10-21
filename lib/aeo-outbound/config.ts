// Ryan's answers to the spec's §13 questions (docs/superpowers/specs/2026-10-08-aeo-outbound-snapshot-design.md).
// Each default is the spec's assumption. When he answers, change the value here and nowhere else.
export const DECISIONS = {
  /** Q1: titles of the two data sections: first the sources section (the Domain Types donut), then the competitive
   *  visibility section (the bars). Round 3 (Ryan, 2026-10-21): renamed, and new rows show the visibility section first. */
  sectionTitles: ['Cited Sources', 'Competitive Visibility'] as readonly [string, string],
  /** Q2: null ranks the brand among every brand tracked in Peec. A number N (2 or more) ranks it among itself and
   *  the N - 1 competitors with the highest visibility, like the 7 brands Peec's dashboard shows. */
  rankAmong: null as number | null,
  /** Q4: list the sites where competitors appear and the brand does not, ranked by AI answers that used them. */
  competitorSiteGaps: true as boolean,
  /** The source-mix weighting. usage_rate is the field Peec's dashboard sums for its Domain types chart: on 2026-10-19
   *  it reproduced every slice and the Total retrievals on PocketGuard, which retrieval_count missed by up to 1.7
   *  points (Ryan's yes, 2026-10-19). retrieved_chat_count is AIVx's method. */
  sourceMixWeight: 'usage_rate' as 'retrieval_count' | 'retrieved_chat_count' | 'usage_rate',
  /** Q3 (Ryan, 2026-10-12: yes): Glean writes a more specific category instead of using Peec's `industry` (spec v1.1 §16.1). */
  writeSpecificCategory: true as boolean,
  /** Q5 (Ryan, 2026-10-12: only when relevant): at most this many of the three opportunities may come from Peec actions, never forced (spec v1.1 §16.1). */
  peecOpportunityRows: 1 as number,
  /** Q6: the methodology states the prompt count and the models covered. */
  methodologyStatesPromptsAndModels: true as boolean,
  /** Q7 (Ryan, 2026-10-12: "This looks repeatable, yes"): one fixed next-step sentence for every report, the one from his
   *  own example; null would mean one written per brand (spec v1.1 §16.1). */
  fixedNextStep: 'A comprehensive AEO audit can validate these patterns across prompt demand, citations, source influence, owned content, earned media, and technical readiness.' as string | null,
  /** Q8: Approve stays disabled while any slot still says "Needs validation". */
  needsValidationBlocksApprove: true as boolean,
  /** Q9: only PITCH and PITCH_ENDED projects can be used. */
  pitchOnly: true as boolean,
  /** Q10 (Ryan, 2026-10-12: leave AIVx off the report): false makes the sidebar wordmark read "Avenue Z" (spec v1.1 §16.1). */
  showAivxName: false as boolean,
}
export const PITCH_STATUSES: readonly string[] = ['PITCH', 'PITCH_ENDED']
export const NEEDS_VALIDATION = 'Needs validation'
/** Spec v1.1 §19.5, §19.11: the version of the code-written sentences (sentences.ts). Bump it whenever their wording or
 *  rounding changes, so an edited sentence on an older row is never compared word for word with today's. Version 2
 *  (2026-10-20): source-mix whole numbers round the exact share, as Peec does (sentences.ts sharePctAll). */
export const SENTENCES_VERSION = 2
export const GENERATION_DEADLINE_MS = 270_000
export const STALE_GENERATING_MS = 6 * 60_000
/** Report window, in UTC calendar days (spec §7 step 4). With no dates picked the report asks for MAX_LOOKBACK_DAYS back. */
export const MAX_WINDOW_DAYS = 90
export const MAX_LOOKBACK_DAYS = 400
/** A brand shown above this visibility gets a notes-panel warning (spec §7): common-word names match unrelated answers. */
export const IMPLAUSIBLE_VISIBILITY_PCT = 90

/** Data contracts (spec v1.1 §10, §19.6): the mode of each boundary's enforced fields. Every field a Peec boundary reads
 *  outside its enforced set is always observed. There is no off switch. */
export type ContractMode = 'observe' | 'warn' | 'enforce'
export const CONTRACT_MODES = {
  'peec.projects': 'observe',
  'peec.brands': 'enforce',
  'peec.project_profile': 'observe',
  'peec.domains_by_date': 'enforce',
  'peec.brands_report': 'enforce',
  'peec.brands_by_model': 'enforce',
  'peec.model_channels': 'observe',
  'peec.domains_report': 'enforce',
  'peec.actions': 'observe',
  'peec.prompts': 'enforce',
  'glean.slots': 'enforce',
  'request.generate': 'enforce',
  'request.slots': 'enforce',
  'settings.row': 'enforce',
  'stored.data': 'enforce',
  'stored.slots': 'enforce',
  'stored.notes': 'enforce',
} as const satisfies Record<string, ContractMode>
export type ContractBoundary = keyof typeof CONTRACT_MODES

/** Every fixed word on the v1.0 page (render.ts at 06e68c0d), keyed by its page slot (spec v1.1 §3). The default of each
 *  page.* slot on a row from before v1.1. A new row takes section titles and the wordmark from settings instead. None
 *  contains a number, so grounding on a row's page words is unchanged until Ryan types one. */
export const PAGE_WORDS_V1 = {
  series: 'AI Visibility Snapshot',
  headline_label: 'Headline signal',
  // The v1.0 words, frozen: DECISIONS.sectionTitles changed in round 3, and a row from before v1.1 keeps these.
  section_1_title: 'Category data',
  section_2_title: 'Competitive visibility',
  opps_label: 'Opportunities',
  method_nav: 'Methodology',
  category_label: 'Category:',
  market_label: 'Market:',
  window_prefix: 'Data window:',
  chart_1_title: 'Domain Types',
  chart_2_title: 'Competitive Visibility',
  why_title: 'Why it matters',
  opps_title: 'Three opportunities to explore',
  opps_col_1: 'Signal',
  opps_col_2: 'Opportunity to explore',
  opps_col_3: 'Likely workstream',
  opps_takeaway: 'These are opportunity hypotheses for discussion, not a full roadmap.',
  method_label: 'Methodology:',
  next_label: 'Next step:',
  prepared_label: 'Prepared',
  footer_name: 'Avenue Z',
  footer_desc: 'Avenue Z is a digital marketing and PR agency specializing in AI visibility and Answer Engine Optimization (AEO). We help brands earn citation authority with AI models through earned media, content strategy, and technical optimization.',
  footer_link: 'avenuez.com ↗',
  footer_disclaimer: 'Data reflects a Peec AI visibility snapshot for the stated window and is directional. Avenue Z makes no representations about future AI visibility outcomes.',
  sidebar_wordmark: DECISIONS.showAivxName ? 'AIVx' : 'Avenue Z',
  sidebar_powered: 'Powered by Avenue Z',
  sidebar_link: 'avenuez.com ↗',
  method_title: 'Methodology and next step',
}
