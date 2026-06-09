/**
 * Verbatim metric definitions, pulled word-for-word from each source tool's
 * source of truth. These power tooltips across the Answer Engine Optimization
 * (peec-ai) report section.
 *
 * Single rule: `text` is a verbatim quote from the cited `sourceUrl`. Edit
 * `text` only by re-quoting from the source; do not paraphrase.
 *
 * Re-fetched on 2026-06-09. Re-verify periodically.
 */

export interface MetricDefinition {
  /** Verbatim quote from the source tool's docs. */
  text: string
  /** Which source tool the definition is pulled from. */
  source: 'Peec AI' | 'GA4' | 'Sitebulb' | 'Screaming Frog' | 'Avenue Z'
  /** URL of the source page where this definition lives. */
  sourceUrl?: string
  /** Optional framing — e.g. "Shown YTD vs. prior year" — appended to the
   *  verbatim text so the tooltip still describes how it's displayed here. */
  framing?: string
}

/** Compose a tooltip string: verbatim definition + optional framing. */
export function tooltipText(def: MetricDefinition, extraFraming?: string): string {
  const framing = [def.framing, extraFraming].filter(Boolean).join(' ')
  return framing ? `${def.text} ${framing}` : def.text
}

// ─── Peec AI ─────────────────────────────────────────────────────────────────

export const PEEC: Record<string, MetricDefinition> = {
  visibility: {
    text: 'Percentage of AI responses where your brand appears.',
    source: 'Peec AI',
    sourceUrl: 'https://docs.peec.ai/metrics-overview',
  },
  brandVisibility: {
    text: 'Your brand is explicitly mentioned in the response.',
    source: 'Peec AI',
    sourceUrl: 'https://docs.peec.ai/metrics-overview',
  },
  sourceVisibility: {
    text: "Your domain or content was used or cited — even if your brand isn't named.",
    source: 'Peec AI',
    sourceUrl: 'https://docs.peec.ai/metrics-overview',
  },
  sov: {
    text: 'Percentage of your brand mentions in AI responses compared to all tracked brands mentioned.',
    source: 'Peec AI',
    sourceUrl: 'https://docs.peec.ai/metrics-overview',
  },
  position: {
    text: 'Average ranking when your brand appears in AI responses (lower numbers are better).',
    source: 'Peec AI',
    sourceUrl: 'https://docs.peec.ai/metrics-overview',
  },
  retrieved: {
    text: 'Percentage of chats where at least one URL from this domain appeared as a source.',
    source: 'Peec AI',
    sourceUrl: 'https://docs.peec.ai/metrics-overview',
  },
  retrievalRate: {
    text: 'Average number of times a URL from this domain appeared as a source per chat.',
    source: 'Peec AI',
    sourceUrl: 'https://docs.peec.ai/metrics-overview',
  },
  citationRate: {
    text: 'Average number of times a domain was explicitly referenced in response text when used.',
    source: 'Peec AI',
    sourceUrl: 'https://docs.peec.ai/metrics-overview',
  },
  citations: {
    text: 'Average number of times the domain was explicitly referenced in response text when used.',
    source: 'Peec AI',
    sourceUrl: 'https://docs.peec.ai/metrics-overview',
  },
  sourceMetrics: {
    text: 'Metrics that analyze which websites AI platforms use as references when answering your prompts.',
    source: 'Peec AI',
    sourceUrl: 'https://docs.peec.ai/metrics-overview',
  },
}

// ─── Google Analytics 4 ──────────────────────────────────────────────────────

export const GA4: Record<string, MetricDefinition> = {
  session: {
    text: 'A period during which a user is engaged with your website or app.',
    source: 'GA4',
    sourceUrl: 'https://support.google.com/analytics/answer/12195621',
  },
  engagedSession: {
    text: 'A session that meets any of the following criteria: Lasts longer than 10 seconds, Has a key event, Has 2 or more screen or page views.',
    source: 'GA4',
    sourceUrl: 'https://support.google.com/analytics/answer/12195621',
  },
  engagementRate: {
    text: 'The percentage of engaged sessions on your website or mobile app.',
    source: 'GA4',
    sourceUrl: 'https://support.google.com/analytics/answer/12195621',
  },
  bounceRate: {
    text: 'The percentage of sessions that were not engaged.',
    source: 'GA4',
    sourceUrl: 'https://support.google.com/analytics/answer/12195621',
  },
}

// ─── Avenue Z internal definitions ───────────────────────────────────────────
// These are NOT pulled from a third-party source — they are Avenue Z's
// classifications. Treat the `text` here as the canonical internal definition.

export const AVENUE_Z: Record<string, MetricDefinition> = {
  brandTypes: {
    text: "Brand types are AI-inferred based on each brand's name and positioning. Verify accuracy before sharing externally.",
    source: 'Avenue Z',
  },
  domainTypes: {
    text: 'Domain types are classified by Peec AI based on each domain\'s content and category.',
    source: 'Avenue Z',
  },
  domainTypeOwn:           { text: 'Your own owned domains.',                                            source: 'Avenue Z' },
  domainTypeCorporate:     { text: 'Brand and company websites.',                                        source: 'Avenue Z' },
  domainTypeCompetitor:    { text: 'Competing brand domains.',                                           source: 'Avenue Z' },
  domainTypeUGC:           { text: 'User-generated content — Reddit, Quora, forums, etc.',               source: 'Avenue Z' },
  domainTypeEditorial:     { text: 'News outlets and editorial publications.',                           source: 'Avenue Z' },
  domainTypeReference:     { text: 'Wikipedia, databases, and directories.',                             source: 'Avenue Z' },
  domainTypeInstitutional: { text: 'Academic, government, and non-profit sources.',                      source: 'Avenue Z' },
  domainTypeOther:         { text: 'Unclassified or miscellaneous domains.',                             source: 'Avenue Z' },
}

// ─── Sitebulb ────────────────────────────────────────────────────────────────

export const SITEBULB: Record<string, MetricDefinition> = {
  hint: {
    text: 'A set of issues or opportunities that are pre-checked by Sitebulb, so you only need to look into them if an issue is present.',
    source: 'Sitebulb',
    sourceUrl: 'https://support.sitebulb.com/en/articles/9854034-about-sitebulb-hints',
  },
  severityLevels: {
    text: 'Sitebulb categorises hints by severity: Critical, High, Medium, Low, Insight.',
    source: 'Sitebulb',
    sourceUrl: 'https://support.sitebulb.com/en/articles/9854034-about-sitebulb-hints',
  },
  hintStatus: {
    text: 'Hint status flags whether a given issue is New, Resolved, Existing, or Worsened relative to the last crawl.',
    source: 'Avenue Z',
  },
}

// ─── Screaming Frog ──────────────────────────────────────────────────────────
// No central glossary on screamingfrog.co.uk; these are the closest verbatim
// quotes from the product page and HTTP-status tutorial.

export const SCREAMING_FROG: Record<string, MetricDefinition> = {
  crawl: {
    text: 'The Screaming Frog SEO Spider is a website crawler that audits your site for over 300 SEO issues.',
    source: 'Screaming Frog',
    sourceUrl: 'https://www.screamingfrog.co.uk/seo-spider/',
  },
  httpStatus: {
    text: "If the SEO Spider only crawls one page, or does not crawl as expected, the 'Status' and 'Status Code' are the first things to check.",
    source: 'Screaming Frog',
    sourceUrl: 'https://www.screamingfrog.co.uk/seo-spider/tutorials/http-status-codes-when-crawling/',
  },
}

// ─── Profound (verbatim source PENDING — replace text when Profound docs available) ───

export const PROFOUND: Record<string, MetricDefinition> = {
  visibility: {
    text: "Profound's Visibility Score measures the percentage of mentions out of the total responses tracked.",
    source: 'Avenue Z',
    sourceUrl: 'https://www.tryprofound.com/blog/how-to-track-your-visibility-in-ai-search',
    framing: '(Verbatim Profound source pending — verify before sharing externally.)',
  },
  sov: {
    text: 'Share of voice measures the percentage of brand mentions a company receives compared to competitors across AI-generated responses.',
    source: 'Avenue Z',
    framing: '(Verbatim Profound source pending — verify before sharing externally.)',
  },
  position: {
    text: 'Average position when your brand appears in AI search responses across the tracked prompt set.',
    source: 'Avenue Z',
    framing: '(Verbatim Profound source pending — verify before sharing externally.)',
  },
}

// ─── Avenue Z internal — PR Proof / PR-related concepts ──────────────────────

export const PR_PROOF: Record<string, MetricDefinition> = {
  placement: {
    text: 'A PR placement is a media mention secured by Avenue Z (or the client) and logged in the PR Proof Library.',
    source: 'Avenue Z',
  },
  matchback: {
    text: 'Matchback joins logged PR placements against AI-cited URLs and domains to measure how often earned coverage is being surfaced in AI answers.',
    source: 'Avenue Z',
  },
  opportunityScore: {
    text: 'A composite score weighing competitor presence, prompt coverage, and brand absence to rank PR pitching opportunities highest-impact-first.',
    source: 'Avenue Z',
  },
  promptCoverage: {
    text: 'Percentage of tracked prompts where this domain appears.',
    source: 'Avenue Z',
  },
}
