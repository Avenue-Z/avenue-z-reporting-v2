# Content Impact Tab — Phase 1 Metric Coherence Audit

**Context:** Tina's V2 meta-feedback was: "Overall, I'm noticing that a lot of metrics seem like they are
misnamed / misrepresented... titles, descriptions, and representation of values (count vs percentage) in
the metrics are getting jumbled around."

Phase 1 Tasks 2-5 fixed the four specific instances Tina cited. This audit closes the gap: every metric
currently rendered on the Content Impact tab is reconciled against its real data source before the
Phase 1 PR opens. Coverage scope: sections A, B, C, F, H.1, H.2.

**Files audited:**
- `components/report-sections/peec-ai/content-impact-tables.tsx`
- `components/report-sections/peec-ai/content-impact.tsx`
- `lib/peec/metric-definitions.ts`
- `lib/peec/client.ts` (ApiDomainRow + TopDomain types)
- `lib/ga4/content-derive.ts`

---

## Audit Table

| # | Section | Metric | Title (verbatim) | Tooltip text (verbatim) | Value source | Units | Delta units | Delta label shown | Verdict |
|---|---------|--------|-----------------|------------------------|-------------|-------|-------------|------------------|---------|
| 1 | §A KPI | Citation Share | "Citation Share" | hint: "Owned share of total AI citations" | `(yourBrandCitations / totalCitationsAllDomains) * 100` content-impact.tsx:764 | percentage (0-100) | pp (current minus prior) | "N.N% vs previous period" | MISMATCH:delta-label |
| 2 | §A KPI | Prompt Coverage | "Prompt Coverage" | hint: "Tracked prompts citing owned domains" | `ownedPromptCoveragePct()` content-impact.tsx:783 | percentage (0-100) | pp (current minus prior) | "N.N% vs previous period" | MISMATCH:delta-label |
| 3 | §A KPI | AI Referral Traffic | "AI Referral Traffic" | hint: "GA4 sessions from AI sources" | `sumSessions(..., isAiRow)` content-impact.tsx:798 | count (integer sessions) | % change (((c-p)/p)*100) | "N.N% vs previous period" | OK |
| 4 | §A KPI | Organic Traffic | "Organic Traffic" | hint: "GA4 Organic Search channel sessions" | `sumSessions(..., isOrganicRow)` content-impact.tsx:808 | count (integer sessions) | % change (((c-p)/p)*100) | "N.N% vs previous period" | OK |
| 5 | §B | Prompt Coverage | "Prompt Coverage" | "Percentage of tracked prompts citing this specific URL. (Avenue Z internal - derived from Peec per-URL prompt_id dimension.)" | `(urlPromptIds(coverage, urlKey).length / totalTrackedPrompts) * 100` content-impact.tsx:1110 | percentage (0-100) | pp (current minus prior) tables.tsx:180 renderDelta(,'pp') | "pp" | OK |
| 6 | §B | Citation Share | "Citation Share" | "This URL's share of total AI citations across all tracked URLs in the period. (Peec AI citation_count weighted by URL.)" | `(cite / totalCitationsCurrentRows) * 100` content-impact.tsx:1098 | percentage (0-100) | pp (current minus prior) tables.tsx renderDelta(,'pp') | "pp" | OK |
| 7 | §B | AI Referral Traffic | "AI Referral Traffic" | "GA4 sessions whose source matches the AI referrer domain list (chat.openai.com, perplexity.ai, gemini.google.com, etc.). (GA4 filtered by Avenue Z internal referrer list.)" | `aiReferredForPath(path)` content-impact.tsx:1122 | count (integer sessions) | % change (((c-p)/p)*100) renderDelta(,'pct') | "%" | OK |
| 8 | §B | Organic Sessions | "Organic Sessions" | "GA4 sessions whose default channel group is Organic Search. (GA4 sessionDefaultChannelGroup dimension.)" | `organicForPath(path)` content-impact.tsx:1129 | count (integer sessions) | % change renderDelta(,'pct') | "%" | OK |
| 9 | §B | Engagement Rate | "Engagement Rate" | "The percentage of engaged sessions on your website or mobile app." (GA4.engagementRate.text) | `g.engagementRate` (fraction [0,1] from GA4 row) content-impact.tsx:1136 | fraction [0,1] stored; rendered as `(r.engagementRate * 100).toFixed(1)%` tables.tsx:231 | pp: `(er - erPrior) * 100` content-impact.tsx:1139; renderDelta(,'pp') | "pp" | OK |
| 10 | §C Speed | Median Days to First Traffic | "Median Days to First Traffic" | (none -- tile has no hover tooltip) | `median(firstTrafficDays)` content-impact.tsx:627; `computeUrlTiming().daysToFirstTraffic` content-derive.ts:141 | days (integer) | no delta | n/a | OK |
| 11 | §C Speed | Median Days to First AI Activity | "Median Days to First AI Activity" | (none) | `median(firstAiDays)` content-impact.tsx:628 | days (integer) | no delta | n/a | OK |
| 12 | §C Speed | Fastest AI-Indexed Content | "Fastest AI-Indexed Content" | (none) | `Math.min(...firstAiDays)` content-impact.tsx:629 | days (integer, min across URLs) | no delta | n/a | OK |
| 13 | §C Speed | Slowest AI-Indexed Content | "Slowest AI-Indexed Content" | (none) | `Math.max(...firstAiDays)` content-impact.tsx:630 | days (integer, max across URLs) | no delta | n/a | OK |
| 14 | §F | Prompt Coverage | "Prompt Coverage" | (no tooltip in §F table) | `(currentPromptIds.length / totalTrackedPrompts) * 100` content-impact.tsx:1242 | percentage (0-100) | pp renderDelta(,'pp') | "pp" | OK |
| 15 | §F | Citation Share | "Citation Share" | (no tooltip in §F table) | `(cite / totalCitationsCurrentRows) * 100` content-impact.tsx:1255 | percentage (0-100) | pp renderDelta(,'pp') | "pp" | OK |
| 16 | §F | AI Referral Traffic | "AI Referral Traffic" | (no tooltip in §F table) | `aiReferredForPath(path)` content-impact.tsx:1266 | count (integer sessions) | % change renderDelta(,'pct') | "%" | OK |
| 17 | §F | Organic Sessions | "Organic Sessions" | (no tooltip in §F table) | `organicForPath(path)` content-impact.tsx:1273 | count (integer sessions) | % change renderDelta(,'pct') | "%" | OK |
| 18 | §F | Engagement Rate | "Engagement Rate" | (no tooltip in §F table) | `engagementRateForPath(path)` fraction [0,1] content-impact.tsx:1280 | fraction [0,1] stored; rendered as `(r.engagementRate * 100).toFixed(1)%` tables.tsx:358 | pp: `(er - erPrior) * 100` content-impact.tsx:1283; renderDelta(,'pp') | "pp" | OK |
| 19 | §H.1 | Source Visibility | "Source Visibility" | "Percentage of chats where at least one URL from this domain appeared as a source." (PEEC.retrieved.text) | `d.retrieved` (TopDomain.retrieved = retrieved_percentage from Peec) client.ts:137 | percentage (0-100, Peec api field `retrieved_percentage`) | pp renderDelta(,'pp') tables.tsx:422 inline | "pp" | OK |
| 20 | §H.1 | Citation Share | "Citation Share" | "This domain's share of total citations across all competitor domains in the period. (Avenue Z internal, derived from Peec citation_count.)" | `(d.citationCount / totalCompetitorCitations) * 100` content-impact.tsx:1340 | percentage (0-100, derived) | null (truthful, no prior topDomains) | n/a | OK |
| 21 | §H.1 | Prompt Coverage | "Prompt Coverage" | "Percentage of tracked prompts where this domain appears. (Avenue Z internal.)" (TT.promptCoverage) | `getPromptCoverage(d.domain)` content-impact.tsx:1335 | percentage (0-100) | pp renderDelta(,'pp') | "pp" | OK |
| 22 | §H.2 | Citation Share | "Citation Share" | "This URL's share of total citations across all cited URLs in the period. (Avenue Z internal, derived from Peec citation_count.)" | `(cite / totalCitationsCurrentRows) * 100` content-impact.tsx:1377 | percentage (0-100, derived) | pp renderDelta(,'pp') | "pp" | OK |

---

## Mismatches Found

### 2 mismatches: §A KPI Citation Share delta label + §A KPI Prompt Coverage delta label

**Rows 1 and 2** in the audit table above.

**What the math actually produces:**
- Citation Share delta: `citationSharePct - citationSharePctPrior` (content-impact.tsx:773-776). This is a percentage-point change. Example: share goes from 12.0% to 14.3%; delta = 2.3 (pp).
- Prompt Coverage delta: `promptCoveragePct - promptCoveragePctPrior` (content-impact.tsx:789-791). Same: pp change.

**What the KpiCard renders:**
`{Math.abs(delta).toFixed(1)}% vs previous period` (content-impact.tsx:94, hardcoded suffix).

**The jumble:** The suffix "%" implies the delta is a relative percent-change (e.g., "grew 2.3%"), but the value is actually an absolute percentage-point difference (e.g., "grew by 2.3 pp"). For AI Referral Traffic and Organic Traffic this happens to be correct because those deltas ARE true percent-changes. But Citation Share and Prompt Coverage deltas are pp, not % change, so the "%" suffix misrepresents them.

**Fix applied:** FB-051a -- add optional `deltaMode` prop to `KpiCard` ('pp' or 'pct', default 'pct'). Citation Share and Prompt Coverage cards pass `deltaMode="pp"`, which renders "pp vs previous period" instead of "% vs previous period". AI Referral Traffic and Organic Traffic remain 'pct' (default), unchanged.

---

## Other observations (no mismatches)

- **Engagement Rate (§B, §F):** GA4 API returns fraction [0,1]. Both sections multiply by 100 before display (`(r.engagementRate * 100).toFixed(1)%`). Delta is computed as `(er - erPrior) * 100` so it is also in pp and passed to `renderDelta(,'pp')`. Both renderer and delta math are consistent. OK.
- **Source Visibility (§H.1):** Peec field is `retrieved_percentage` (already a percentage 0-100). Tooltip says "Percentage of chats..." which matches. Renamed from "AI Visibility" in FB-053. OK.
- **Citation Share (§H.1):** Uses share-of-period math (FB-051). Tooltip is inline (FB-054). No prior data = truthful null delta. OK.
- **Citation Share (§H.2):** URL-level share-of-period. Tooltip is inline (FB-055). OK.
- **§C Speed Stats tiles:** No tooltips needed; labels are self-describing and values are "N days". OK.
- **§F table:** Columns have no individual tooltips (table title provides context). Not a mismatch; the table section header and SectionWrapper description explain the data. No tooltip on Prompt Coverage or Engagement Rate in §F is a gap but not a mismatch since the values and math are correct.
