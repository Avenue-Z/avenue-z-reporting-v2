# AEO Section: Comprehension Map + Candidate Findings Register

Branch: `tina-post-split-qa` (== `origin/dev` @ `178079e`). Read-only sweep.
~11,000 lines read across 5 layers. **No source changed.**

## Baseline (regression net, captured before any edit)

- Type-check: **clean**.
- Test suite: **54 passed / 54** across 16 files (vitest).
- Working tree: only `docs/qa/` untracked; zero tracked files modified.
- Any future change is measured against this. If tsc breaks or test count drops, we caused it.

## Status legend for findings

- `UNVERIFIED` — reported by one comprehension read, NOT yet cross-checked. Do not act or report to client.
- `CONFIRMED` — independently re-verified against source (pending step).
- `INTENDED` — verified to be deliberate/correct behavior, not a bug (pending step).
- `FALSE` — re-check showed the finding was wrong.

**Every item below is `UNVERIFIED` until the adversarial verification pass runs.**

---

## Data lineage (one-line origin per surface, for scorecard grounding)

Shared: every Peec number originates in `lib/peec/client.ts` `getPeecOverview` (one
`Promise.all` of ~13 fetches to `api.peec.ai/customer/v1`). Visibility = visCount/visTotal*100;
citation share = yourBrandCitations/totalCitations*100; model filtering via `lib/peec/by-model.ts`.

- **Overview:** template order overview-synopsis → kpi-cards → visibility-chart → llm-breakdown → winners-losers → brand-rankings → domains-row → footer. Visibility chart is YTD-pinned; winners/losers reactive to date AND model.
- **Content Impact:** `content-impact.tsx` orchestrates 17 fetches (Peec url-citations + GA4 current/prior + content calendar). §A KPIs, §B Watched Pages, §C Speed Stats (publish-to-today), §D scatter (30-day lock), §E slope, §F Fullsite, §H.1/§H.2 competitor.
- **PR Influence:** `pr-influence.tsx`. Synopsis, Sentiment, Matchback, Top Editorial Domains, Prompt Clusters, Top Editorial Opportunities. Sentiment + opportunities reactive to date+model.
- **Technical Performance:** `technical-audit.tsx`. Screaming Frog (Drive CSV) + Sitebulb + Peec agent-analytics (30-day bot lock) + GA4. No model filter anywhere; no synopsis.

---

## Candidate findings register (UNVERIFIED — triaged by potential client visibility)

### High (a value or label a client could directly challenge)

| ID | Section | Candidate finding | Source ref | Status |
|----|---------|-------------------|-----------|--------|
| F1 | Content Impact §A | Citation Share KPI hint appends "filtered to selected AI models" but the value may derive from unfiltered top-level Peec fields | content-impact.tsx:~1038 | UNVERIFIED (reads conflict on whether value is filtered) |
| F2 | Overview / CI | Model filter only partially wired: some KPIs react, brand-rankings / top-domains / visibility chart may not, so a single-model selection could show inconsistent visibility across cards | ctx.ts, domains-row.tsx, brand-rankings.tsx | UNVERIFIED |
| F3 | Content Impact §H.1 | Source Visibility value may be all-model while Citation Share in the same row is model-filtered | content-impact.tsx:~1410 | UNVERIFIED |
| F4 | Overview | LLM breakdown tooltip says "year-to-date" but data may be picker-range, not YTD | llm-breakdown-table.tsx:99 | UNVERIFIED |
| F5 | Technical Perf | "Crawl Date" may be the render date (`new Date()`), not the Screaming Frog export date | screaming-frog/client.ts:578 | UNVERIFIED |
| F6 | Technical Perf | PageOverlap issue-join may use raw string equality instead of `urlJoinKey`, under-reporting issues to 0 | technical-audit-tables.tsx:402 | UNVERIFIED |

### High (PR Influence, from the fifth read)

| ID | Section | Candidate finding | Source ref | Status |
|----|---------|-------------------|-----------|--------|
| F17 | PR Influence Matchback | `getPRProofData` called with no date arg, so placements/matchback may be all-time, but subtitle + empty state say "selected timeframe". Card may not react to the date picker | pr-influence.tsx:214, tables.tsx:479/492 | UNVERIFIED |
| F18 | PR Influence Top Editorial Opportunities | Citation Share value/delta may stay all-engine under a model filter (filter changes which rows show, not the share math), while tooltip implies model-scoped | pr-influence.tsx:403-414, tables.tsx:227 | UNVERIFIED |
| F19 | PR Influence synopsis | Comment claims synopsis is "model-agnostic" but its inputs derive from model-filtered sets, so content does change with model (relevant: this synopsis is being restored) | pr-influence.tsx:461-466 | UNVERIFIED |

### Medium (internal correctness / consistency)

| ID | Section | Candidate finding | Source ref | Status |
|----|---------|-------------------|-----------|--------|
| F7 | Shared | `brandVisibilityByModel` uses last-value-wins while `domainCitationsByModel` sums the same multi-channel case | client.ts:763-773 | UNVERIFIED |
| F8 | Shared | `totalCitations` and Σ`totalCitationsByModel` use different endpoints/limits, so model-filtered share may not reconcile to the unfiltered KPI | client.ts:500 vs 775 | UNVERIFIED |
| F9 | Content Impact | Prompt Coverage rendered at 3+ different precisions across §A/§B/§F/§H.1 for the same metric | tables.tsx:181/319, client.ts:502 | UNVERIFIED |
| F10 | metric-definitions | `citations`/`citationRate` tooltips say "average number of times" (count) but value renders as a percentage | metric-definitions.ts:68-77 | UNVERIFIED (need consumed-vs-dead check) |
| F11 | Technical Perf | FixList methodology advertises a 20% "human-from-AI" weight that is hardcoded to 0 | fix-list.ts:39 | UNVERIFIED |
| F12 | Technical Perf | robots.txt "LLM bots blocked" status derived from site-wide 4xx/redirect ratios, not robots.txt or LLM-bot isolation | agent-analytics.ts:401 | UNVERIFIED |

### Low (cosmetic / dead code)

| ID | Section | Candidate finding | Source ref | Status |
|----|---------|-------------------|-----------|--------|
| F13 | Overview / CI | Stale "Vertex Gemini" provenance comments; implementation is Glean | overview-synopsis.tsx:8 | UNVERIFIED |
| F14 | Shared | `isYou` / competitor split uses substring match (`name.includes(brand)`) | client.ts:472 | UNVERIFIED |
| F15 | Technical Perf | Tailwind dynamic class names (`grid-cols-${n}`) won't be emitted by the static scanner | technical-audit.tsx:425 | UNVERIFIED |
| F16 | Technical Perf | "Change Since Last Crawl" column always null → renders `--` | technical-audit-tables.tsx:424 | UNVERIFIED |

---

## Next step: adversarial verification pass

Each candidate above gets independently re-checked against source and classified
CONFIRMED / INTENDED / FALSE. Only CONFIRMED items become backlog or fixes. Nothing
here is treated as real, or mentioned to Tina, until then. Findings that turn out to be
INTENDED (e.g. GA4 traffic not model-scoped because Google doesn't tag the AI engine)
are documented as intended, not fixed.

## Not in scope of the current branch

The `tina-post-split-qa` branch is scoped to restoring the 3 synopses for Avenue Z.
None of F1-F16 are part of that change. They are a separate, verified backlog decision.
