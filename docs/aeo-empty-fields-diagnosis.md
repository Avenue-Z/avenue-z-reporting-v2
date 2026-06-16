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
- **§B "AI Citations"** (per planned URL) and **§F "Post-Launch AI Lift"** (`retrievedDelta` per owned
  domain) come straight from Peec. They show `--`/blank where Peec returns nothing for that URL/domain.
  Many avenue-z planned pieces are brand-new March-2026 news posts that simply aren't cited yet — likely
  legitimately empty. **Action:** spot-check a couple of these URLs in the Peec dashboard to confirm it's
  real absence, not a join-key mismatch.

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
