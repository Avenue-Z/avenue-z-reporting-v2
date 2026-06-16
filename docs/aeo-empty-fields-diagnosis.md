# AEO Empty-Field Diagnosis (PR Influence + Content Impact) — avenue-z

> Diagnosis date: 2026-06-16 (supersedes the 2026-06-14 version) · Branch: `main` + this change
> Why fields render `--`/`0` in the PR Influence and Content Impact reports for **avenue-z**, and
> what is now fixed vs. still outstanding. All findings verified against avenue-z's live DB config and
> live Google/Peec API responses (not assumptions).

## What changed since 2026-06-14

The original diagnosis predates several merges. Re-verified live state:

- **`content_calendar_sheet_id` is now SET** (`1-Ar5...NngyQ`) and the sheet **is shared** with the
  service account — the SA reads **134 rows**. The old "Class 1: column is NULL" is **resolved**.
- **GA4 is healthy** — `properties/355114071` returns **19,057 sessions / 30d**, shared with the SA.
- **GA4-1…GA4-5 shipped** (PRs #39/#41/#42) — §A glance totals, §F per-host AI-referred, §E trajectory,
  and PR Post-Publish Trend are wired.
- **This change** wired the remaining production stubs and fixed the publish-date format bug (below).

So the headline is now: **everything is connected.** Remaining `--` are data-format, genuinely-missing
source data, infrastructure, or hard Peec limitations — not a connection you can "turn on."

Repro commands (read-only; require `.env.local`):
```bash
# Google SA against GA4/Drive/Sheets
npx tsx --env-file=.env.local scripts/diagnose-google-sa.ts
```

---

## Fixed in this change

| Area | Was | Now |
|---|---|---|
| **Publish-date format** | Sheet stores `M/D` (`3/3`); code required ISO → §C empty, §D time-to-AI/AI-referred `--` | New `lib/content-calendar/date.ts` parses `M/D` using the sibling **"Date" column** (`March 2026`) for the year. All 134 rows now resolve to ISO. Unit-tested (`date.test.ts`). |
| **§B AI-Referred Sessions** | hard-coded `null` | New GA4 `pagePath × sessionSource` query → per-path AI-referred sessions, joined by planned URL. |
| **§G sub-view 1** (traffic, no citations) | hard-coded `[]` | GA4 pages with sessions minus owned-cited paths, top 10 by sessions. |
| **§G sub-view 2** (citations, little traffic) | hard-coded `[]` | Owned cited URLs sorted ascending by GA4 sessions, top 10. |
| **§G sub-view 3** AI Citations + AI-Referred cols | hard-coded `null` | Per-path citation count (Peec) + per-path AI-referred (GA4). |
| **§H sub-view 3** (competitor pages across themes) | hard-coded `[]` | Extended `aggregateDomainCoverage` → `tagIdsByUrlKey`; competitor URLs cited under **2+ themes**. **Avg Position column dropped** (not sourceable — see Limits). Cache bumped to v3. |
| **Misleading copy** | "Recommended action: Connect GA4 for full session analysis" (GA4 *is* connected) | "No AI citations or crawls yet — monitor and strengthen on-page signals" |
| **§F "Post-Launch AI Lift"** | `--` for all owned domains on the 30-day view | The "Last 30 days" Peec domain set now carries a prior-30d baseline (`buildTopDomains(domains30Res, domainsPrior30Res)`; data was already fetched) so `retrievedDelta` is real, not hard-0. Peec cache bumped to v6. `--` now remains only for brand-new domains with no prior data (genuine "unmeasurable lift"). |
| **PR · "AI Engines"** (matchback) | generic "AI Engines" / `--` | Real engine names from per-URL citations; "Not cited" instead of `--`; also repairs the model filter on that table. |
| **PR · "PR" column** (Top Editorial Domains) | `--` for non-matches in prod | "No" when PR Proof data is loaded; `--` reserved for when it isn't. |
| **§B "AI Citations"** | `--` for uncited URLs | `0` when the Peec citations query loaded (uncited = real 0); `--` only on query failure. |
| **§D AI-Referred (empty group)** | `0` | `--` for an empty group (consistent with the other empty-group metrics). |
| **§G topic fallback** | `--` for non-calendar pages | Readable label from the URL slug (`labelFromPath`). |
| **Technical Performance · "Human Visits from AI"** (Page Overlap) | hard-coded `null` (the report fetched no GA4) | Added a `pagePath × sessionSource` GA4 query to `TechnicalAuditReport`; per-path AI-referred sessions passed to `PageOverlapTable` (`aiReferredByPath`). Tracked path → count (0 if none); path GA4 doesn't cover → `--`. Verified live: 149 pages have AI-referred sessions. |

**Key data-layer additions:** `lib/content-calendar/date.ts` (`parseCalendarDate`, `parseYearHint`);
`monthContext` column alias in `lib/content-calendar/client.ts`; `DomainCoverage.tagIdsByUrlKey` +
`urlTagNames()` in `lib/peec/url-citations.ts`; a `pagePath × sessionSource` GA4 query in
`content-impact.tsx` (`aiRefByPath` / `aiReferredForPath`).

The **0-vs-no-data rule** is preserved throughout: a resolved query's `0` shows `0`; `--` is reserved for
a path/host/domain the upstream genuinely doesn't cover.

---

## Still outstanding (genuine gaps — not stubs)

These remain `--` after this change and are **not** code bugs.

### 1. §B "Update Date" — column absent in the sheet
The calendar sheet has no update/last-updated column (headers: `Date, Priority, Content Type, Topic,
Status, Publish Date, Suggested Author, …, Notes`). The parser maps it case-insensitively if present,
but there is nothing to map. **Fix:** add an "Update Date" (or "Last Updated") column to the sheet.

### 2. Peec-sourced fields with no value for a given URL/domain
- **§B "AI Citations"** (per planned URL) comes straight from Peec; shows `0` for URLs Peec hasn't cited
  (now a real 0, not `--`). Many avenue-z planned pieces are brand-new March-2026 news posts that simply
  aren't cited yet — legitimately 0. **Action:** spot-check a couple of these URLs in the Peec dashboard
  to confirm it's real absence, not a join-key mismatch.
- **§F "Post-Launch AI Lift"** is now wired (prior-30d baseline, see Fixed table) but will still read `--`
  for a brand-new owned domain that has no prior-period data to compute a delta against — that case is a
  genuine "lift not yet measurable," not a bug.

### 3. "AI bot activity = 0" — infrastructure (Class 3, unchanged)
`successRate`/bot activity are **real adverse data**: every logged AI-bot request to `www.avenuez.com`
returns `301`, so crawlers never reach a 200. This also leaves **§G sub-view 3 "Topic"** as `--` for
crawled paths that don't match a calendar path (the redirect/host variance). **Fix is infra** — make AI
bots reach 200 content on the host they crawl; the dashboard self-corrects. No code change.

### 4. Avg Position (per-URL) — hard Peec limitation
Peec exposes citation *position* only at the **brand** level, never per domain/URL. That is why the §H.3
"Avg Position" column was **removed** rather than wired, and why per-URL/per-domain "Avg Position"
elsewhere is permanently "Avg. Citations" (`citation_avg`) instead.

### 5. Linked Mention (PR Influence · "Which PR placements are being cited in AI?")
**Decision: left as a `--` pending-data placeholder** (not dropped). It is hard-coded `null` in
production at `pr-influence.tsx` (`linkedMention: prIsDemo ? … : null`).

- **What it means:** a per-placement Yes/No — does this piece of earned media coverage contain an actual
  **hyperlink (backlink) to the client's site**, vs. an unlinked brand mention. Pairing it with
  cited-by-AI shows whether a placement builds LLM brand authority *and* passes a crawlable link, or only
  the former (a cue to go request a link).
- **Why it's missing:** the PR Proof sheet
  (`1tcZZ3p0Syy_525xnyW0V8fXnB8No7jBFVoqjIzT1F8M`) has no such column. Its columns are
  `Client | Outlet | Headline | Publication Date | Link | Impact | Date Added` — and "Link" is the URL of
  the placement article itself, not whether that article links back to the client. The fact lives in each
  article's HTML; nothing in the sheet captures it.
- **To enable later:** add a "Linked Mention" column (Yes/No, filled at logging time, or via a tool that
  checks each article for a backlink to the client domain), then extend the PR Proof parser
  (`lib/pr-proof/client.ts` — add `linkedMention` to `PRProofColumnMap` + `DEFAULT_COLUMN_MAP`, parse
  Yes/No → boolean) and surface it on the matchback row. Until then it correctly shows `--`.

### 6. §B "How is each planned content piece performing?" — `--`-heavy rows are a date-range artifact (by design)
**Decision: left as-is — this is expected behavior, not a bug.** Some planned-content rows show `--` for
**Sessions, Users, Views, Engagement Rate, and AI-Referred Sessions** (the GA4-derived columns) while the
calendar columns (Topic, URL, Type, Status, Publish Date) still populate.

- **Why:** GA4 only returns pages that had **sessions within the selected date range**. A planned piece
  that has gone quiet isn't in the response, so the per-URL join finds nothing and those columns render
  `--`. Verified for avenue-z (default last-30-days window): **122 / 134** planned URLs have traffic in
  the last 30 days; the other **12** (mostly March/April posts that cooled off) show `--`. Over a
  365-day window, **133 / 134** populate — so the pages are real and correctly matched, just not recently
  trafficked.
- **The `--` is intentional, not a missing 0.** A GA4 absence is ambiguous — it can mean "0 sessions this
  period" *or* "this calendar URL didn't match any GA4 path" (a typo'd/wrong slug — 1 of 134 never
  matches). Rendering `--` (rather than `0`) keeps those distinct, and the **Match Status** column
  surfaces the mismatch case. Engagement Rate is a rate, so it is also `--` (undefined at 0 sessions),
  consistent with Avg Citations (§4).
- **To populate:** widen the dashboard date range (e.g. last 12 months); the historical traffic exists.

### 7. §D "Which delivers more lift — new content or optimization?" — Optimized column is `--` (no optimized content)
**Decision: left as-is — correct, not a bug.** avenue-z's content calendar is **100% "New Blog"**, so the
**Optimized Content** group has **0 URLs**. With nothing to aggregate, **Avg Sessions, AI Citation Rate,
and Time to First AI Activity** all render `--`:

- These are an **average / rate / first-event** over an empty set — undefined, not `0`. Showing `0` would
  imply "we measured optimized content and it scored zero," which is false; `--` is the honest value
  (same reasoning as Avg Citations §4 and the empty-set cases throughout).
- **Consistency fix applied:** AI-Referred Sessions previously showed `0` for the empty group (it was
  initialized to `0` before summing over the empty URL list) while its siblings showed `--`. It now also
  shows `--` for an empty group (`sectionDGroup` gates on `urls.length > 0`); a *non-empty* group with no
  AI-referred sessions still correctly shows a real `0`.
- **To make the comparison meaningful:** tag some calendar rows as optimized/refreshed (via Content Type,
  or add a Content Action column the parser already understands — `new`/`optimized`/`other`). Until the
  calendar contains optimized pieces, there is nothing to compare net-new against.

### 8. §G sub-view 3 "Which pages have AI bot attention but no citations or human visits?" — AI-Referred Sessions mixes `0` and `--` (by design)
**Decision: left as-is — the `0`/`--` split is intentional and a useful signal here.** This table's rows
come from **AI bot crawl paths** (`agentData.topPaths`), and the AI-Referred Sessions column uses
`aiReferredForPath(path)`, which separates two distinct cases:

- **`0`** — GA4 **tracks** this page (it had sessions in the window) and **none were AI-referred**. A real,
  measured zero: the page gets traffic, but no AI engine is sending visits.
- **`--`** — GA4 has **no data for that crawled path** in the window, so AI-referred is *unknowable*, not
  zero (we return `--` rather than a misleading `0`).

**Why `--` is especially relevant in *this* table:** the rows are bot-crawled URLs, and many aren't normal
content pages — `/robots.txt`, redirect targets, error pages, and the `www.avenuez.com` **301** paths
(see §3). GA4 never records those as pages, so they correctly land on `--`. So the split is diagnostic:
`--` rows are largely bots hitting non-page / redirected URLs (the §3 infra issue), while `0` rows are
real pages bots crawl but AI isn't driving traffic to yet. Same 0-vs-no-data rule as everywhere else.

---

## Reference: file map

- Components: `components/report-sections/peec-ai/{content-impact,content-impact-tables,pr-influence,pr-influence-tables}.tsx`
- Peec data layer: `lib/peec/{client,agent-analytics,url-citations,fix-list}.ts`
- Content calendar: `lib/content-calendar/{client,date,types}.ts` (+ `date.test.ts`)
- GA4: `lib/ga4/client.ts`, `lib/ga4/content-derive.ts`
- Schema/config columns: `lib/db/schema.ts`
- Probe script: `scripts/diagnose-google-sa.ts`

## Bonus (unrelated to avenue-z)

`scripts/diagnose-google-sa.ts` previously showed **renaissance** GA4 failing with `PERMISSION_DENIED`
on `properties/310998391` — that property isn't shared with the service account. Separate fix; re-verify
before building renaissance AEO data.
