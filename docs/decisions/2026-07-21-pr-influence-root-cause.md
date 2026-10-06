# PR Influence citation mismatch: root cause and decisions needed

**Date:** 2026-07-21
**Author:** Thomas Chang
**Decision owner:** Tina Fleming
**Source:** Asana "Bug: PR Influence Dashboard (Renaissance Focus)", raised by Bristol via Tina, confirmed by Paul 2026-07-20
**Stakeholder doc:** `Tina QFA Final v11.docx` (9 questions), generated from this record

Every claim below is either verified against source at commit `e7f0ddb`, or measured
against live data (Peec API, the PR Proof sheets, and the production database) using
read-only probes. Where a claim is neither, it says so.

> **Correction notice.** An earlier version of this document, written before database
> and API access was available, stated that Renaissance and Avenue Z share one PR Proof
> sheet. **That was wrong.** It came from `scripts/seed.ts`, which has diverged from the
> live database. They use different sheets with different layouts. Section 4 has the
> corrected architecture, and section 7 lists everything the first pass got wrong.

---

## 1. The problem in plain terms

Bristol asked whether Renaissance's placement in Digital Insurance was really being
cited by ChatGPT:

```
https://www.dig-in.com/opinion/why-insurance-ai-needs-clean-workflows-and-accountability
```

Tina checked Peec and could not find that URL. Peec did show other dig-in.com articles.
The dashboard still reported the placement as cited by ChatGPT.

The dashboard never checked whether that specific article was cited. It only checked
whether **dig-in.com** was cited, by anything.

**Independently confirmed.** Paginating 6,000 cited URLs per window across 7, 30, 90 and
180 days, the placement URL is absent from every one. The dig-in.com URLs Peec does hold
are two Progressive/GEICO stories and two J.D. Power stories, all four attributed to
`[ChatGPT]`. That is where the ChatGPT label on Bristol's row came from.

---

## 2. Root cause, confirmed

### 2.1 The path a placement takes

| Step | Where | What happens |
|---|---|---|
| 1 | `lib/pr-proof/client.ts` | Reads the client's PR Proof Google Sheet, skips rows with no link, derives `domain` from the link |
| 2 | `lib/peec/url-citations.ts` | Fetches cited URLs from Peec for the selected dates. Each result carries `url`, `urlKey`, `domain` |
| 3 | `lib/pr-proof/matchback.ts` | Joins the two |
| 4 | `components/report-sections/peec-ai/pr-influence-tables.tsx` | Renders the table |

### 2.2 The defect

`lib/pr-proof/matchback.ts` throws away the article address on both sides of the join.

```ts
:74    const h = normHost(c.domain)              // reads .domain, discards .url/.urlKey
:110   if (!citedHostsInPeriod.has(h)) continue  // placement admitted by domain
:111   const aiEnginesCiting = [...(enginesByHost.get(h) ?? [])]   // engines, host-keyed
:117   const { first, last } = datesFor(h)       // dates, host-keyed
:123   citedByAI: true,                          // hardcoded
```

`p.link` is never compared to anything. It is copied to the output at `:121` for display,
and that is its only use.

**Three surfaces, not one.** Row inclusion (`:110`), engine attribution (`:111`) and the
date columns (`:117`) are all keyed on host. Fixing only the Yes/No leaves a row that
correctly says cited while listing another article's engines and another article's dates.

### 2.3 Reproduced by running the shipped code

`computePlacementMatchback` was executed from a byte-identical copy
(sha256 `cb952a94c093a00b63e44693a826ec123e20132fa73cef91dca5dbeb574e96bf`) against
Bristol's scenario:

```
Peec contains our placement URL? NO
  citedByAI          : true
  aiEnginesCiting    : [ ChatGPT ]
  headline (Article) : ""
```

Three controls isolate the cause:

- Citing only `dig-in.com/x`, sharing nothing with our path, still returns `true`.
- A placement with an **empty link** still returns `true` when its domain matches.
- When Peec **does** cite our exact URL, the output is **identical** to the false case.
  A real citation and a fabricated one render the same row.

### 2.4 This was a deliberate specification

- `lib/pr-proof/matchback.ts:5-10` records the 2026-07-09 direction: *"Matching is
  domain-level (a placement is cited if any URL on its domain is cited in the period)"*
- `lib/pr-proof/matchback.test.ts:192` is a **passing** test named
  `includes both placements when two placements share a cited domain (domain-level)`.
  It asserts exactly the behaviour Bristol flagged.
- `lib/peec/metric-definitions.ts:204`, client-facing glossary text, says matchback joins
  against AI-cited *"URLs and domains"*.

Fixing this inverts a green test and rewrites a client-facing definition.

---

## 3. The row cap makes the answer non-deterministic

`lib/peec/url-citations.ts:205` requests `/reports/urls` with `limit: 2000` and no
pagination, ranked by citation count across all domains.

Measured rank of dig-in.com in Renaissance's Peec project:

| Window | Rank(s) | Inside the top 2,000? |
|---|---|---|
| 7 days | none | no |
| 30 days | 2566, 4815 | **no** |
| 90 days | **1937**, 2435, 3949, 3950 | **yes** |
| 180 days | 2846, 4391 | no |

Bristol's placement reads **cited on a 90-day view and not cited on 30 days**, decided
entirely by where an unrelated article ranks that month. Tina's screenshot is the 90-day
view. The engine attribution flickers on the same boundary: at the top-2,000 cut the
dig-in.com engine rows fall outside the window, so the same row today would render
**Yes with a blank AI Engines cell**.

Two further measurements:

- `limit: 2000`, the exact request production makes, returns **503** intermittently.
- Pagination via `offset` works cleanly to at least 6,000 rows, so the fix is viable.
  Prior art: `lib/peec/citation-dates.ts:120-159`.

---

## 4. Architecture, corrected

Seven clients are configured. **Two have a PR Proof sheet, and they are different sheets.**

| Client | Sheet | Column map | Peec project |
|---|---|---|---|
| `avenue-z` | `1tcZZ3p0…` (Master Library, 263 rows, 65 client values) | `NULL` → default A-G | `or_043ae735…` |
| `renaissance` | `13mN9AWa…` (Media Coverage, 12 rows) | `{"link":"D","outlet":"C","publicationDate":"A"}` | `or_60dbe88c…` |

`begin-health`, `elix`, `elix-healing`, `kind-patches` and `love-bug` have no PR Proof
sheet and are unaffected.

### 4.1 Renaissance's tracker has no headline column

```
Date | Reporter | Outlet | Article Link | Media Type
```

There is no headline field. The column map correctly maps what exists and omits
`headline` because there is nothing to map. `lib/pr-proof/client.ts:149` returns `''`
for an undeclared column, so **every** Article cell renders blank.

This is a data-model gap, not a mapping bug and not missing cell values. Avenue Z's sheet
has a Headline column and a `NULL` map, so it defaults to A-G and displays fine. That is
why only Renaissance shows the empty column Tina flagged.

Two related notes:

- `client.ts:210` is `client.prProofColumnMap ?? DEFAULT_COLUMN_MAP`. `??` replaces the
  whole object rather than merging, so any partial map silently blanks every field it
  omits. Worth hardening regardless.
- The absent `client` key is **correct** here. Renaissance's sheet is single-tenant with
  no Client column, so skipping the filter at `client.ts:156` is right.

### 4.2 Only one tab is read

`resolveTabName` finds no `Master Library` in Renaissance's sheet and falls back to the
first tab, `Media Coverage`. The sheet also has Theme Tracker, Conference, Interviews and
Awards. Nobody has confirmed that scope.

### 4.3 Half of Renaissance's placements are not articles

Six of twelve are `buzzsprout.com`, `open.spotify.com`, `youtu.be` (×2) and
`podcasts.apple.com` (×2).

None currently produces a false citation, but that is luck. Peec **does** record
`youtube.com` as a cited source for Renaissance. The placement is logged as a `youtu.be`
short link, and `normHost('youtu.be') !== normHost('youtube.com')`, so it does not match.
One full-length YouTube URL in the tracker and it fires.

---

## 5. Measured impact

Production behaviour (top-2,000 fetch), against each client's own sheet and own Peec project:

| Client | Placements | Cited now (30d) | Cited now (90d) | After the fix |
|---|---|---|---|---|
| Renaissance | 12 | 4 | 5 | **1** |
| Avenue Z | 3 | 2 | 2 | **0** |
| **Total** | **15** | **6** | **7** | **1** |

The single defensible citation is Renaissance's Employee Benefit News piece,
`benefitnews.com/news/building-a-benefits-dream-team-choosing-the-right-ancillary-partner`.

On the 90-day view Tina screenshotted, **four of five cited rows are false**.

Note: at full pagination the domain-matched counts rise (Renaissance 5 on 30 days,
Avenue Z 3), so removing the row cap makes the overstatement worse until the URL fix
lands. **Ship both together.**

---

## 6. Decisions requested

Asked in `Tina QFA Final v11.docx`. Each changes what gets built.

| # | Decision | Follows from |
|---|---|---|
| 1 | Tighten to exact-article matching | §2.2, §2.4 |
| 2 | Keep any publisher-level signal, and engine attribution | §2.2 (`:111`) |
| 3 | What to do with First cited / Most recent | §2.2 (`:117`), §4 |
| 4 | Show uncited placements | §2.2 (`:110`) |
| 5 | Whether the tracker records headlines | §4.1 |
| 6 | Whether podcast and video links count | §4.3 |
| 7 | Which tabs feed the report | §4.2 |
| 8 | Synopsis counting semantics | `pr-influence-synopsis.ts:82` |
| 9 | Client notice before the numbers drop | §5 |

Two defaults are stated rather than asked: a citation requires `citation_count > 0`
(6.3% of returned rows carry zero), and a confirmed citation with no engine attribution
still counts.

---

## 7. What the first pass got wrong

Recorded so the same mistakes are not repeated.

| Claim | Reality | Cause |
|---|---|---|
| Renaissance and Avenue Z share one sheet | Different sheets, different layouts | Used `seed.ts` after flagging it might not match live |
| "37 of 65 clients affected" | 2 clients have dashboards, 15 placements total | Counted client values in Avenue Z's sheet as clients |
| Renaissance has 5 placements | 12 | Read the wrong sheet |
| The sheet has blank headline cells | No blank cells anywhere; the field does not exist | Inferred from the symptom |
| The sheet has homepage-instead-of-article links | ~6 of 263 in Avenue Z's sheet, none Renaissance's | Assumed from how PR trackers usually look |
| Article-level dates are a same-shape fix | `/reports/domains` has no article granularity | Not checked before recommending |

The pattern in every case: a claim written before the check that would have settled it.

---

## 8. Engineering items, no sign-off needed

- **Row cap.** `url-citations.ts:205` `limit: 2000`, no pagination, 503s intermittently.
  Pagination confirmed viable to 6,000 rows.
- **Host aliases.** `urlJoinKey` (`lib/url.ts:12-32`) handles protocol, `www.`, case,
  trailing slash, query and hash. It does not handle `youtu.be` → `youtube.com`, AMP
  variants, or syndicated copies. These become the dominant failure mode under article
  matching.
- **`urlJoinKey` has no CI coverage.** `lib/url.test.ts` is a bare `node:assert` script
  and is not in the Vitest include list (`vitest.config.ts:13-25`). It is about to become
  the load-bearing join key.
- **Column map merge.** `client.ts:210` should spread over `DEFAULT_COLUMN_MAP` so a
  partial map degrades per field instead of nulling omitted ones.
- **Model-filter path.** `matchback.ts:114` drops a no-engine row when a model filter is
  active. The stated default (keep it, blank engines cell) must be applied there too.
- **Cache busting is manual.** `lib/cache.ts:53,67` keys on a hand-written `version`
  string. Nothing flushes on deploy. Bump `getUrlCitations` and
  `getPRInfluenceSynopsis` when the fix ships.
- **Synopsis mislabel.** `pr-influence-synopsis.ts:82` reports the all-time placement
  total under the label "Total PR placements in period", and
  `validateSynopsisGrounding` rule 3 then enforces that the prose repeats it.
- **Test to invert.** `matchback.test.ts:192` asserts the old behaviour and must be
  rewritten, not deleted. Update the stale decision comment at `matchback.ts:5-10`.
- **Dead code.** `pr-influence.tsx:280` computes `hasPR` by comparing domains only. It is
  typed through to the row but never rendered. Harmless today, would ship the same false
  attribution the day someone displays it.

---

## 9. Verification

- 20/20 code claims asserted line by line against source.
- 23/25 live-data checks pass at production's exact row limits. The two non-passes are
  the engine cell emptying at the top-2,000 cut, which is §3, not a contradiction.
- Probe scripts are read-only: Peec read endpoints, Sheets `values.get` under
  `spreadsheets.readonly`, and `SELECT` against the database.
- Not verified: whether reports already delivered were affected by §3, and whether Peec
  can supply article-level dates at all.
