// lib/organic-social/aeo-informed/column-map.ts
// Every column, graph and setting in the client's outline, mapped to the field that carries it. Status is documentation tied to the private
// golden run against the PDF (exact = reproduced to the digit from live data, derived = computed by a rule we chose, unverified = not yet
// proven, not_available = Peec does not provide it). A test keeps this map and the output types in step.

export type MapStatus = 'exact' | 'derived' | 'unverified' | 'not_available'
export type MapEntry = { pdf: string; output: 'socials' | 'gaps' | 'graph' | 'config' | 'none'; field: string | null; status: MapStatus; note: string }

const S = (pdf: string, field: string, status: MapStatus, note: string): MapEntry => ({ pdf, output: 'socials', field, status, note })
const G = (pdf: string, field: string, status: MapStatus, note: string): MapEntry => ({ pdf, output: 'gaps', field, status, note })
const R = (pdf: string, field: string, status: MapStatus, note: string): MapEntry => ({ pdf, output: 'graph', field, status, note })

export const PDF_COLUMN_MAP: MapEntry[] = [
  // Settings that apply to every data set
  { pdf: 'Domain tags = the custom Organic Social tag', output: 'config', field: null, status: 'exact', note: 'Filter domain_classification (or domain_tag_id) on the Organic Social name; both select the same rows' },
  { pdf: 'URL tags include the custom Organic Social tag (should be ONLY)', output: 'config', field: null, status: 'unverified', note: 'No URL carries the source tag, so a URL-tag filter returns nothing; only the domain level is used' },
  { pdf: 'Indicators stay on default', output: 'config', field: null, status: 'exact', note: 'Change versus the previous window of the same length; reproduced to the digit' },
  { pdf: 'Date range: MoM, YTD, All time', output: 'config', field: null, status: 'derived', note: 'windows.ts calendarMonth, ytd and allTime; the previous window is the same length directly before' },
  { pdf: 'Insights', output: 'none', field: null, status: 'not_available', note: 'Team-written text, not Peec data' },

  // Example Only Socials / Competitor Socials tables
  S('# (row number)', 'rank', 'exact', 'Retrievals descending, then URL'),
  S('URL', 'url', 'exact', 'The exact string Peec returns'),
  S('URL title', 'title', 'exact', 'From the row with the most retrievals'),
  S('Channel name chip', 'channelTitle', 'exact', 'channel_title'),
  S('Channel owner (our matching)', 'ownerBrandId', 'derived', 'Channel title starting with the brand name, on a platform the brand registered; matches how Peec attributes channels'),
  S('Star: your own channel', 'isOwnChannel', 'derived', 'Proven for LinkedIn and the own brand only'),
  S('URL type', 'urlType', 'exact', 'Peec classification with a display name'),
  S('Domain type', 'domainType', 'exact', 'The selector name, constant for the whole view'),
  S('Example mentioned', 'ownBrandMentioned', 'exact', 'Own brand id among the brands mentioned with the URL'),
  S('Mentions (count and names)', 'mentionedBrandCount', 'derived', 'Count of brand ids on the URL'),
  S('Mentions (names)', 'mentionedBrandNames', 'derived', 'Own brand first, then alphabetical'),
  { pdf: 'Mentions (logos)', output: 'none', field: null, status: 'not_available', note: 'The brands endpoint returns a color and no image' },
  S('Retrievals', 'retrievals', 'exact', 'retrieval_count summed over the window'),
  S('Retrievals change', 'retrievalsDelta', 'exact', 'Against the previous window; null when the URL is new'),
  S('Retrieved (percent)', 'retrievedPct', 'exact', 'Retrievals over the window chats (brands report visibility_total)'),
  S('Retrieved change', 'retrievedPctDelta', 'exact', 'Percentage points against the previous window'),
  S('Total (column cut off in the PDF)', 'totalCitations', 'derived', 'Named total citations by the team (2026-11-12 feedback); citation_count summed over the window, not reproduced to the digit against the PDF'),
  S('Total change (cut off in the PDF)', 'totalCitationsDelta', 'unverified', 'Cut off in the PDF; against the previous window'),
  S('Citation rate (team feedback 2026-11-12)', 'citationRate', 'derived', 'Citations over retrievals for the window, null at 0 retrievals; the same ratio as the citation_rate Peec returns per row'),
  S('Citation rate change', 'citationRateDelta', 'derived', 'This rate minus the previous window\'s, as a fraction'),
  S('Mentions (brand ids for the colored dots)', 'mentionedBrandIds', 'derived', 'The ids behind the names, joined with | in the same order; colors from meta.brands'),

  // URL Gaps table
  G('# (row number), URL Gaps', 'rank', 'unverified', 'Competitor brands mentioned times retrievals, descending, then retrievals, then URL. Fits the outline\'s five visible rows; Peec does not document it'),
  G('URL, URL Gaps', 'url', 'exact', 'The exact string Peec returns'),
  G('URL title, URL Gaps', 'title', 'exact', 'From the row with the most retrievals'),
  G('Channel name, URL Gaps', 'channelTitle', 'exact', 'channel_title'),
  G('URL type, URL Gaps', 'urlType', 'exact', 'Peec classification with a display name'),
  G('Domain type, URL Gaps', 'domainType', 'exact', 'The selector name'),
  G('Mentions (count), URL Gaps', 'mentionedBrandCount', 'derived', 'Count of brand ids on the URL'),
  G('Mentions (names), URL Gaps', 'mentionedBrandNames', 'derived', 'Own brand first, then alphabetical; logos not available'),
  G('Citation share', 'citationShare', 'exact', 'Citations over the sum across every row of the pull; matches the outline rows within rounding'),
  G('Citation position', 'citationPosition', 'exact', 'Sum of positions over count of inline-cited chats; null when never cited inline (her dash)'),
  G('Retrievals (and change), URL Gaps', 'retrievals', 'exact', 'Retrievals and deltas match her rows to the digit'),
  G('Retrievals change, URL Gaps', 'retrievalsDelta', 'exact', 'Against the previous window of the same length'),
  G('Total citations, URL Gaps', 'totalCitations', 'exact', 'Matches her rows to the digit'),
  G('Total citations change, URL Gaps', 'totalCitationsDelta', 'unverified', 'Her change column is cut off in the PDF'),
  G('Citation rate, URL Gaps (team feedback 2026-11-12)', 'citationRate', 'derived', 'Citations over retrievals for the row, null at 0 retrievals'),
  G('Citation rate change, URL Gaps', 'citationRateDelta', 'derived', 'This rate minus the previous window\'s, as a fraction'),
  G('Mentions (brand ids), URL Gaps', 'mentionedBrandIds', 'derived', 'The ids behind the names, joined with | in the same order; colors from meta.brands'),

  // Graphs
  R('Used as a source on Reddit, YouTube, Instagram, TikTok and LinkedIn', 'value', 'exact', 'Chats with an own source over chats; all four weekly points match within 0.1 percentage point'),
  R('Citations on LinkedIn, TikTok, Reddit, YouTube and Instagram', 'value', 'exact', 'Own-channel citations per 7-day bucket; matches her weekly points'),
  R('Citations on LinkedIn', 'value', 'exact', 'Same, LinkedIn only; matches her four points'),
  R('Citations on Instagram ("No source data" is a null value)', 'value', 'derived', 'Null in every bucket when no own Instagram source in the window. The default fourth graph (fourthGraph)'),
  R('Citations on TikTok (the fourth graph when fourthGraph is tiktok; not in the outline)', 'value', 'derived', 'The Instagram rule on TikTok rows, for a client without Instagram; graph id citations_tiktok'),
  R('Graph series name', 'series', 'exact', 'The own brand name'),
  R('Graph x axis, bucket start', 'weekStart', 'exact', '7-day buckets from the chart start date'),
  R('Graph x axis, bucket end', 'weekEnd', 'exact', 'Inclusive'),
  R('Graph which chart', 'graphId', 'exact', 'One of four ids'),
  R('Graph unit', 'unit', 'exact', 'citations or percent'),
  R('Graph partial bucket flag (our addition)', 'partial', 'derived', 'True when a bucket crosses the as-of date'),
]
