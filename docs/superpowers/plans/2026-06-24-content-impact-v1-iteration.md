# Content Impact (v1) — Layout Deletions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape the Content Impact tab to match Tina's v1 recommended layout by surgically deleting 7 sections (§D, §E, §G, §H.3, §I, §J, footer) and removing all now-dead supporting compute + imports + dead table components. **Layout-only this round — no adds, no renames, no content.** New sections Tina marked ADD (synopsis card, scatter chart, slope chart) come next round with content.

**Architecture:** All deletions land in `components/report-sections/peec-ai/content-impact.tsx` plus the dead-component cleanup in `components/report-sections/peec-ai/content-impact-tables.tsx`. Library files (`lib/ga4/content-derive.ts`, `lib/peec/url-citations.ts`) stay untouched because their tests still consume `tallyTrajectories` / `Trajectory` / `urlTagNames` — only the *imports* in `content-impact.tsx` get dropped. No data wiring, no API changes, no copy edits. Every deletion applies universally (not gated by `calendarIsDemo`).

**Tech Stack:** Next.js 15 RSC, TypeScript strict, no test framework changes (repo convention: `node:assert` + `tsx` when tests are needed).

**Feedback source:** Tina's Google Doc "Content Impact Tab — Recommended layout" (3 screenshots). Cataloged as FB-032-a through FB-032-g.

**Literal interpretation policy (non-negotiable):**
- Every red REMOVE line in Tina's doc maps 1:1 to a deletion task below.
- If it's not flagged for deletion, it stays exactly as-is.
- No renames (Tina's labels "Snapshot KPIs"/"Watched Pages"/"Speed Stats"/"Fullsite Content Performance"/"Competitor Analysis" are doc-organization labels; we don't add on-page headings this round).
- No new placeholders for Tina's green ADD items — content comes next round.
- The yellow ISSUE on Snapshot KPIs ("comparison period doesn't display change") is a separate FB, deferred.

---

## File structure

| File | Touched | Change |
|---|---|---|
| `components/report-sections/peec-ai/content-impact.tsx` | Yes | Delete 7 JSX blocks + their supporting compute + 3 dead imports |
| `components/report-sections/peec-ai/content-impact-tables.tsx` | Yes | Delete 6 unused exported table components + their Row types |
| `docs/official-feedback/feedback-log.md` | Yes | New entry under `## Closed` for FB-032 with all 7 sub-items |
| `docs/official-feedback/changelog.md` | Yes | New top entry for FB-032 |
| `docs/official-feedback/status.md` | Yes | Active branch update + Recently merged stub (after PR) |

All library files (`lib/ga4/content-derive.ts`, `lib/peec/url-citations.ts`) and demo-data files stay UNTOUCHED.

---

## Pre-flight (already done by controller)

- Branch `official-feedback-content-impact-tab-v1` cut from `main@f9f99da`.
- `npx tsc --noEmit` exit 0 on baseline.

---

## Task 1 — FB-032-a: Delete §D "Which delivers more lift — new content or optimization?"

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact.tsx`

- [ ] **Step 1: Delete the §D JSX SectionCard block**

In `components/report-sections/peec-ai/content-impact.tsx`, find this block (starts at the `Section D` comment, ends with `</SectionCard>` followed by the §E comment):

```tsx
      {/* ── Section D: Net-New vs Optimized Content Lift ───────────────────── */}
      <SectionCard
        title="Which delivers more lift — new content or optimization?"
        description="Compares performance between net-new content launches and optimized (refreshed/expanded) pages."
      >
        {calendarData && (newRows.length > 0 || optimizedRows.length > 0) ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { label: 'Net-New Content',   rows: newRows,       action: 'new' as const,       color: '#60FF80',
                demoAvgSessions: '1,012', demoCitationRate: '26%', demoAiRefSessions: '847', demoTimeToAI: '18 days' },
              { label: 'Optimized Content', rows: optimizedRows, action: 'optimized' as const, color: '#39A0FF',
                demoAvgSessions: '715',   demoCitationRate: '18%', demoAiRefSessions: '315', demoTimeToAI: '9 days' },
            ].map(({ label, rows: group, action, color, demoAvgSessions, demoCitationRate, demoAiRefSessions, demoTimeToAI }) => {
              const g = sectionDGroup(group)
              const tAi = groupMedianFirstAi(action)
              return (
              <div key={label} className="flex flex-col gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                  <p className="text-xs font-bold text-white/70">{label}</p>
                  <span className="ml-auto text-xs tabular-nums text-white/40">{group.length} URLs</span>
                </div>
                <div className="flex flex-col gap-2">
                  {[
                    {
                      metric: 'Live URLs',
                      value: group.filter(r => r.matchStatus === 'matched' || r.matchStatus === 'unknown').length.toString(),
                      live: true,
                    },
                    {
                      metric: 'Bot-Crawled Pages',
                      value: group.filter(r => (r.aiBotVisits ?? 0) > 0).length.toString(),
                      live: true,
                    },
                    { metric: 'Avg Sessions (30d)',          value: calendarIsDemo ? demoAvgSessions : g.avgSessions !== null ? g.avgSessions.toLocaleString() : 'None',  live: calendarIsDemo || g.avgSessions !== null },
                    { metric: 'AI Citation Rate',            value: calendarIsDemo ? demoCitationRate : g.citationRate !== null ? `${g.citationRate}%` : 'None', live: calendarIsDemo || g.citationRate !== null },
                    { metric: 'AI-Referred Sessions',        value: calendarIsDemo ? demoAiRefSessions : g.aiReferred !== null ? g.aiReferred.toLocaleString() : 'None', live: calendarIsDemo || g.aiReferred !== null },
                    { metric: 'Time to First AI Activity',   value: calendarIsDemo ? demoTimeToAI : tAi !== null ? `${Math.round(tAi)} days` : 'None',     live: calendarIsDemo || tAi !== null },
                  ].map(({ metric, value, live }) => (
                    <div key={metric} className="flex items-center justify-between text-xs">
                      <span className="text-text-muted">{metric}</span>
                      <span className={cn('tabular-nums', live ? 'text-white' : 'text-white/20')}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              )
            })}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {['Net-New Content', 'Optimized Content'].map((type) => (
              <div key={type} className="flex flex-col gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                <p className="text-xs font-bold text-white/60">{type}</p>
                <div className="flex flex-col gap-2">
                  {['Avg Sessions (30d)', 'AI Citation Rate', 'AI-Referred Sessions', 'Time to First AI Activity'].map(m => (
                    <div key={m} className="flex items-center justify-between text-xs">
                      <span className="text-text-muted">{m}</span>
                      <span className="tabular-nums text-white/20">None</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {!calendarData && (
          <p className="text-[10px] text-text-muted">Requires content calendar with Content Action column (new / optimized / other).</p>
        )}
      </SectionCard>

```

Delete it entirely (including the trailing blank line so the §E comment lands cleanly after the §C closer).

- [ ] **Step 2: Delete the §D-only supporting compute**

In the same file, near line 357-358, find and delete:

```tsx
  // Section D aggregates (new vs optimized)
  const newRows       = enrichedRows.filter(r => r.contentAction === 'new')
  const optimizedRows = enrichedRows.filter(r => r.contentAction === 'optimized')

```

In the same file, near line 555-579, find and delete (the entire `parseDateRange` + `groupMedianFirstAi` + `sectionDGroup` block — §D was their only caller):

```tsx
  // §D per-group aggregation. AI-referred is summed within the report window.
  const { startDate: rStart, endDate: rEnd } = parseDateRange(effectiveRange)
  const groupMedianFirstAi = (action: ContentCalendarRow['contentAction']) =>
    median(urlTimings.filter(t => t.action === action).map(t => t.daysToFirstAi).filter((n): n is number => n !== null))
  function sectionDGroup(group: ContentCalendarRow[]) {
    const urls = group.map(r => r.url).filter((u): u is string => !!u)
    const sess = urls.map(u => getGA4Metrics(u, ga4Rows).sessions).filter((n): n is number => n !== null)
    const avgSessions = ga4Rows && sess.length ? Math.round(sess.reduce((a, b) => a + b, 0) / sess.length) : null
    const citedCount = urls.filter(u => (citeByKey.get(urlJoinKey(u) ?? '')?.citationCount ?? 0) > 0).length
    const citationRate = urls.length ? Math.round((citedCount / urls.length) * 100) : null
    // Empty group → -- (consistent with avgSessions/citationRate above); a real
    // group with no AI-referred sessions stays 0.
    let aiReferred: number | null = null
    if (timingOk && urls.length > 0) {
      aiReferred = 0
      for (const u of urls) {
        const p = extractPath(u)
        if (!p) continue
        for (const [date, v] of daysByPath.get(normPath(p))?.entries() ?? []) {
          if (date >= rStart && date <= rEnd) aiReferred += v.aiSessions
        }
      }
    }
    return { avgSessions, citationRate, aiReferred }
  }

```

- [ ] **Step 3: Drop the unused `parseDateRange` import**

Now that §D no longer calls `parseDateRange(effectiveRange)`, verify no other section uses it. The §C/§D timing block uses `deriveCompareRange` (line 208) but NOT `parseDateRange`. Update line 19:

```tsx
import { ga4Query, deriveCompareRange, parseDateRange } from '@/lib/ga4/client'
```

to:

```tsx
import { ga4Query, deriveCompareRange } from '@/lib/ga4/client'
```

- [ ] **Step 4: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: exit 0 with no output. If TS complains about an unused `ContentCalendarRow` import, leave it — §B still uses the type indirectly via `enrichedRows`.

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/peec-ai/content-impact.tsx
git commit -m "$(cat <<'EOF'
FB-032-a: delete Content Impact §D "Which delivers more lift — new content or optimization?"

Tina v1 layout doc marks this section REMOVE. Drops the SectionCard JSX,
the newRows/optimizedRows split, sectionDGroup() + groupMedianFirstAi() +
the parseDateRange import (§D was their only caller).
EOF
)"
```

---

## Task 2 — FB-032-b: Delete §E "Which content is decaying vs. compounding over time?"

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact.tsx`

- [ ] **Step 1: Delete the §E JSX SectionCard block**

In `components/report-sections/peec-ai/content-impact.tsx`, find the §E block (starts at `Section E` comment, ends with `</SectionCard>` followed by §F comment):

```tsx
      {/* ── Section E: Decay vs Compounding Content ────────────────────────── */}
      <SectionCard
        title="Which content is decaying vs. compounding over time?"
        description="Classifies owned content by trajectory. Compounding content with AI citation activity represents the highest-value assets to protect and scale."
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[
            { label: 'Compounding URLs',       color: '#60FF80', desc: 'Traffic accelerating + AI cited',     demoCount: 5 },
            { label: 'Stable URLs',            color: '#FFFC60', desc: 'Flat traffic, some AI activity',      demoCount: 4 },
            { label: 'Decaying URLs',          color: '#FF4444', desc: 'Declining traffic, low AI citation',  demoCount: 2 },
            { label: 'High AI / Low Traffic',  color: '#60FDFF', desc: 'AI-cited but no human traffic yet',   demoCount: 2 },
            { label: 'High Traffic / No AI',   color: '#39A0FF', desc: 'Popular but not AI-indexed',          demoCount: 1 },
            { label: 'No Activity',            color: '#8A8A8A', desc: 'Neither traffic nor AI citations',    demoCount: 1 },
          ].map(({ label, color, desc, demoCount }) => (
            <div key={label} className="flex flex-col gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[11px] font-semibold text-white/60">{label}</span>
              </div>
              <span className={cn('text-lg font-bold', (calendarIsDemo || decayBuckets) ? 'text-white' : 'text-white/20')}>
                {calendarIsDemo ? demoCount : decayBuckets ? decayBuckets[label as Trajectory] : 'None'}
              </span>
              <span className="text-[10px] text-text-muted">{desc}</span>
            </div>
          ))}
        </div>
        {!calendarIsDemo && !decayBuckets && (
          <p className="text-[10px] text-text-muted">Requires GA4 page-level session trends (MoM) + Peec AI citation data to classify content trajectory.</p>
        )}
      </SectionCard>

```

Delete it entirely.

- [ ] **Step 2: Delete the §E-only supporting compute (decayBuckets / decayOk block)**

In the same file, near line 458-483, find and delete:

```tsx
  // §E · trajectory buckets — current vs. prior page sessions × AI-citation
  // presence. Needs both GA4 page queries to have resolved.
  const decayOk = !demoMode && ga4Rows !== null && ga4PriorRows !== null
  let decayBuckets: Record<Trajectory, number> | null = null
  if (decayOk) {
    const curByPath = new Map<string, number>()
    for (const r of ga4Rows!) curByPath.set(normPath(String(r.pagePath ?? '')), Number(r.sessions) || 0)
    const priorByPath = new Map<string, number>()
    for (const r of ga4PriorRows!) priorByPath.set(normPath(String(r.pagePath ?? '')), Number(r.sessions) || 0)
    // "Cited" = an owned-domain page earns an AI citation. Scope to owned hosts
    // so a competitor citation sharing a path (e.g. /blog/x) can't false-match
    // an owned GA4 page. Match by path within that owned-host set.
    const ownedHostSet = new Set(ownDomains.map(d => hostKey(d.domain)))
    const citedPaths = new Set<string>()
    for (const c of urlCitations) {
      if (!ownedHostSet.has(hostKey(c.domain))) continue
      const p = extractPath(c.url)
      if (p) citedPaths.add(normPath(p))
    }
    const allPaths = new Set([...curByPath.keys(), ...priorByPath.keys()])
    decayBuckets = tallyTrajectories(
      [...allPaths].map(path => ({
        cur: curByPath.get(path) ?? 0,
        prior: priorByPath.get(path) ?? 0,
        cited: citedPaths.has(path),
      })),
    )
  }

```

- [ ] **Step 3: Drop the now-unused `tallyTrajectories` + `Trajectory` imports**

Update line 21 of `content-impact.tsx`:

```tsx
import { tallyTrajectories, median, computeUrlTiming, type Trajectory } from '@/lib/ga4/content-derive'
```

to:

```tsx
import { median, computeUrlTiming } from '@/lib/ga4/content-derive'
```

(`median` + `computeUrlTiming` are still used by §C. Library file `lib/ga4/content-derive.ts` and its `.test.ts` stay untouched — those consumers keep `tallyTrajectories` / `Trajectory` alive in the library.)

- [ ] **Step 4: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: exit 0 with no output.

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/peec-ai/content-impact.tsx
git commit -m "$(cat <<'EOF'
FB-032-b: delete Content Impact §E "Which content is decaying vs. compounding over time?"

Tina v1 layout doc marks this section REMOVE. Drops the SectionCard JSX,
the decayBuckets/decayOk compute block, and the tallyTrajectories +
Trajectory imports (§E was their only caller in this file; the helpers
stay in lib/ga4/content-derive.ts for tests).
EOF
)"
```

---

## Task 3 — FB-032-c: Delete §G "Where is content disconnected from AI demand?" (all 3 sub-views)

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact.tsx`

- [ ] **Step 1: Delete the §G entire wrapper + all 3 sub-views**

In `components/report-sections/peec-ai/content-impact.tsx`, find the §G block (starts at `Section G` comment, ends at the matching `</div>` closer followed by the §H comment):

```tsx
      {/* ── Section G: Content Gaps (PRD: 3 sub-views) ────────────────────── */}
      <div className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-bg-surface p-6">
        <div>
          <h3 className="text-sm font-bold text-white">Where is content disconnected from AI demand?</h3>
          <p className="mt-1 text-xs text-text-muted">
            Three views of content gap: pages with traffic but no AI citations, AI-cited pages without human traffic, and bot-crawled pages without citations or visits.
          </p>
        </div>

        {/* Sub-view 1: Traffic but No AI Citations */}
        {(() => {
          // ... entire G.1 IIFE ...
        })()}

        <div className="border-t border-white/[0.06]" />

        {/* Sub-view 2: AI Citations but Little Human Traffic */}
        {(() => {
          // ... entire G.2 IIFE ...
        })()}

        <div className="border-t border-white/[0.06]" />

        {/* Sub-view 3: AI Bot Attention but No Citations/Visits (LIVE from agent-analytics)
            ...comment block... */}
        {(() => {
          // ... entire G.3 IIFE ...
        })()}
      </div>

```

The implementer should delete from `{/* ── Section G:` through the closing `</div>` that immediately precedes `{/* ── Section H:`. This is the full block between `BotAttentionNoCitationsTable` (last child of G.3) and the §H opening SectionCard.

- [ ] **Step 2: Delete the §G-only supporting compute**

In the same file, near line 437-454, find and delete the `§G content-gap maps` block (only §G uses these — H/I/J read different data):

```tsx
  // §G content-gap maps — owned pages keyed by normalized path: GA4 sessions,
  // owned-page citation counts, and calendar topics. "Owned" = a page on an
  // owned Peec domain or one that mentions the brand.
  const ownedHostSet = new Set(ownDomains.map(d => hostKey(d.domain)))
  const sessionsByPath = new Map<string, number>()
  for (const r of (ga4Rows ?? [])) sessionsByPath.set(normPath(String(r.pagePath ?? '')), Number(r.sessions) || 0)
  const citedOwnedByPath = new Map<string, number>()
  for (const c of urlCitations) {
    if (!(ownedHostSet.has(hostKey(c.domain)) || c.mentionsYourBrand) || c.citationCount <= 0) continue
    const p = extractPath(c.url); if (!p) continue
    const np = normPath(p)
    citedOwnedByPath.set(np, Math.max(citedOwnedByPath.get(np) ?? 0, c.citationCount))
  }
  const topicByPath = new Map<string, string>()
  for (const r of enrichedRows) {
    const p = extractPath(r.url); if (!p) continue
    topicByPath.set(normPath(p), r.topic)
  }

```

NOTE on `ownedHostSet`: a second `ownedHostSet` declaration exists inside the now-already-deleted §E `decayOk` block (Task 2). The §G `ownedHostSet` at line ~440 is the only remaining declaration after Task 2. After deleting it here, verify no other section in the file references `ownedHostSet` (it should be only §G after Task 2). Then `labelFromPath` import on line 9 also becomes unused — drop it in Step 3.

- [ ] **Step 3: Drop the now-unused `TrafficNoCitationsTable`, `CitationsLittleTrafficTable`, `BotAttentionNoCitationsTable` imports (and their Row types) + the `labelFromPath` import**

Update the imports near the top of `content-impact.tsx`:

```tsx
import { urlJoinKey, labelFromPath } from '@/lib/url'
```

to:

```tsx
import { urlJoinKey } from '@/lib/url'
```

And update the big `./content-impact-tables` import block. Current state (after Tasks 1+2 — note: these imports were never touched in 1+2 because §D and §E used `SectionCard` not the table components):

```tsx
import {
  PlannedContentPerformanceTable,
  OwnedContentCitedTable,
  TrafficNoCitationsTable,
  CitationsLittleTrafficTable,
  BotAttentionNoCitationsTable,
  CompetitorDomainsCitedTable,
  CompetitorUrlsBrandAbsentTable,
  RepeatedCompetitorPagesTable,
  AISystemsInteractingTable,
  ContentTeamRecommendationsTable,
  type PlannedContentRow,
  type OwnedContentCitedRow,
  type TrafficNoCitationsRow,
  type CitationsLittleTrafficRow,
  type BotAttentionNoCitationsRow,
  type CompetitorDomainsCitedRow,
  type CompetitorUrlsBrandAbsentRow,
  type RepeatedCompetitorPagesRow,
  type AISystemsInteractingRow,
  type ContentTeamRecommendationsRow,
} from './content-impact-tables'
```

Update to (drop the 3 G.* table components + 3 Row types; everything else stays for now — H.3/I/J cleanup happens in later tasks):

```tsx
import {
  PlannedContentPerformanceTable,
  OwnedContentCitedTable,
  CompetitorDomainsCitedTable,
  CompetitorUrlsBrandAbsentTable,
  RepeatedCompetitorPagesTable,
  AISystemsInteractingTable,
  ContentTeamRecommendationsTable,
  type PlannedContentRow,
  type OwnedContentCitedRow,
  type CompetitorDomainsCitedRow,
  type CompetitorUrlsBrandAbsentRow,
  type RepeatedCompetitorPagesRow,
  type AISystemsInteractingRow,
  type ContentTeamRecommendationsRow,
} from './content-impact-tables'
```

- [ ] **Step 4: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: exit 0 with no output.

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/peec-ai/content-impact.tsx
git commit -m "$(cat <<'EOF'
FB-032-c: delete Content Impact §G "Where is content disconnected from AI demand?" (3 sub-views)

Tina v1 layout doc marks this section REMOVE. Drops the wrapper div + all
three sub-views (G.1 Traffic but No AI Citations, G.2 AI Citations but
Little Human Traffic, G.3 Bot Attention but No Citations/Visits), the
ownedHostSet/sessionsByPath/citedOwnedByPath/topicByPath compute (§G was
their only caller), and the now-unused TrafficNoCitationsTable +
CitationsLittleTrafficTable + BotAttentionNoCitationsTable + labelFromPath
imports.
EOF
)"
```

---

## Task 4 — FB-032-d: Delete §H.3 "Which competitor pages repeat across our target themes?"

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact.tsx`

- [ ] **Step 1: Delete the §H.3 sub-view IIFE + its leading separator**

In `components/report-sections/peec-ai/content-impact.tsx`, find the H.3 block. It lives INSIDE the §H SectionCard wrapper — between H.2's closing IIFE and the §H SectionCard closer. It is the third (last) sub-view inside §H. The block to delete starts with the `<div className="border-t border-white/[0.06]" />` separator that precedes the H.3 IIFE comment, and ends with the closing `})()}` of the H.3 IIFE:

```tsx
        <div className="border-t border-white/[0.06]" />

        {/* Sub-view 3: Repeated Competitor Pages Across Themes */}
        {(() => {
          const h3Rows: RepeatedCompetitorPagesRow[] = calendarIsDemo
            ? [
                { url: 'ogilvy.com/insights/brand-authority-in-llms',     competitor: 'Ogilvy',           clusters: ['Brand authority', 'Reputation / trust', 'Industry expertise'], citations: 24 },
                { url: 'edelman.com/research/trust-barometer-2026',       competitor: 'Edelman',          clusters: ['Reputation / trust', 'Buying-stage research'],                 citations: 19 },
                { url: 'webershandwick.com/work/ai-pr-case-studies',      competitor: 'Weber Shandwick',  clusters: ['Industry expertise', 'Competitive comparison'],                citations: 17 },
                { url: 'bcw-global.com/expertise/aeo-services',           competitor: 'BCW',              clusters: ['Brand authority', 'Buying-stage research'],                    citations: 14 },
                { url: 'fleishmanhillard.com/2026/ai-search-report',      competitor: 'FleishmanHillard', clusters: ['Industry expertise', 'Reputation / trust', 'Brand authority'], citations: 13 },
                { url: 'mslgroup.com/insights/generative-pr',             competitor: 'MSL',              clusters: ['Industry expertise', 'Competitive comparison'],                citations: 11 },
              ]
            : !coverageAvailable
              ? []
              : urlCitations
                  .filter(c => !c.mentionsYourBrand && c.competitorBrandNames.length > 0)
                  .map(c => ({
                    url: c.url,
                    competitor: c.competitorBrandNames.join(', '),
                    clusters: urlTagNames(coverage, c.urlKey),
                    citations: c.citationCount,
                  }))
                  .filter(r => r.clusters.length >= 2)   // "repeats across themes" = cited under 2+ clusters
                  .sort((a, b) => b.citations - a.citations)
                  .slice(0, 10)
          return (
            <RepeatedCompetitorPagesTable
              rows={h3Rows}
              emptyMessage="Requires URL-level citation data from Peec AI Pro"
            />
          )
        })()}
```

Delete the entire block above (separator + comment + IIFE).

- [ ] **Step 2: Drop the now-unused `urlTagNames` import + `RepeatedCompetitorPagesTable` + `RepeatedCompetitorPagesRow` imports**

After Task 3, the `url-citations` import line reads:

```tsx
import { getUrlCitations, getDomainCoverage, domainPromptIds, domainTagIds, domainTagNames, urlTagNames, avgCitationsByDomain } from '@/lib/peec/url-citations'
```

Update to (drop `urlTagNames` — H.3 was its only caller in this file; the helper stays in `lib/peec/url-citations.ts` for its `.test.ts`):

```tsx
import { getUrlCitations, getDomainCoverage, domainPromptIds, domainTagIds, domainTagNames, avgCitationsByDomain } from '@/lib/peec/url-citations'
```

Update the `./content-impact-tables` import block — drop `RepeatedCompetitorPagesTable` and `type RepeatedCompetitorPagesRow`:

```tsx
import {
  PlannedContentPerformanceTable,
  OwnedContentCitedTable,
  CompetitorDomainsCitedTable,
  CompetitorUrlsBrandAbsentTable,
  AISystemsInteractingTable,
  ContentTeamRecommendationsTable,
  type PlannedContentRow,
  type OwnedContentCitedRow,
  type CompetitorDomainsCitedRow,
  type CompetitorUrlsBrandAbsentRow,
  type AISystemsInteractingRow,
  type ContentTeamRecommendationsRow,
} from './content-impact-tables'
```

- [ ] **Step 3: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: exit 0 with no output.

- [ ] **Step 4: Commit**

```bash
git add components/report-sections/peec-ai/content-impact.tsx
git commit -m "$(cat <<'EOF'
FB-032-d: delete Content Impact §H.3 "Which competitor pages repeat across our target themes?"

Tina v1 layout doc marks this sub-view REMOVE. Drops the IIFE + its
leading separator from inside the §H SectionCard, plus the now-unused
urlTagNames import (helper stays in lib/peec/url-citations.ts for its
.test.ts) and the RepeatedCompetitorPagesTable + RepeatedCompetitorPagesRow
imports.
EOF
)"
```

---

## Task 5 — FB-032-e: Delete §I "Which AI systems are interacting with our content?"

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact.tsx`

- [ ] **Step 1: Delete the §I section IIFE**

In `components/report-sections/peec-ai/content-impact.tsx`, find the §I block (starts at `Section I` comment, ends with closing `})()}` of the IIFE, followed by the §J comment):

```tsx
      {/* ── Section I: AI Systems Interacting with Our Content (LIVE) ─────── */}
      {(() => {
        const sectionIRows: AISystemsInteractingRow[] = (agentData && bots.length > 0)
          ? bots.map(b => ({
              botId:       b.botId,
              botName:     b.botName,
              botType:     b.botType,
              totalVisits: b.totalVisits,
              uniquePages: b.uniquePages,
              successRate: b.successRate,
              lastSeen:    b.lastSeen,
            }))
          : []
        return (
          <AISystemsInteractingTable
            rows={sectionIRows}
            totalBotVisits={totalBotVisits}
            emptyMessage="No AI bot crawl data available -- check PEEC_AI_CUSTOMER_TOKEN configuration."
          />
        )
      })()}

```

Delete the entire block.

- [ ] **Step 2: Drop the §I-only `bots` alias compute**

In the same file, near line 316, the `bots` alias was only consumed by §I. Find and delete this single line:

```tsx
  const bots = filteredBots
```

(`filteredBots` is still consumed by §A's "Owned URLs with AI Activity" KPI card — keep `filteredBots` itself untouched.)

- [ ] **Step 3: Drop the `totalBotVisits` compute if no other reader remains**

`totalBotVisits` was consumed by §I (table totalBotVisits prop) AND by the footer string at the bottom of the page. After §I is deleted in this task and the footer is deleted in Task 7, `totalBotVisits` becomes fully dead — but the footer still exists at this point, so KEEP `totalBotVisits` for now. It gets deleted as part of Task 7.

- [ ] **Step 4: Drop the now-unused `AISystemsInteractingTable` + `AISystemsInteractingRow` imports**

After Task 4, the `./content-impact-tables` import block reads:

```tsx
import {
  PlannedContentPerformanceTable,
  OwnedContentCitedTable,
  CompetitorDomainsCitedTable,
  CompetitorUrlsBrandAbsentTable,
  AISystemsInteractingTable,
  ContentTeamRecommendationsTable,
  type PlannedContentRow,
  type OwnedContentCitedRow,
  type CompetitorDomainsCitedRow,
  type CompetitorUrlsBrandAbsentRow,
  type AISystemsInteractingRow,
  type ContentTeamRecommendationsRow,
} from './content-impact-tables'
```

Update to (drop `AISystemsInteractingTable` and `type AISystemsInteractingRow`):

```tsx
import {
  PlannedContentPerformanceTable,
  OwnedContentCitedTable,
  CompetitorDomainsCitedTable,
  CompetitorUrlsBrandAbsentTable,
  ContentTeamRecommendationsTable,
  type PlannedContentRow,
  type OwnedContentCitedRow,
  type CompetitorDomainsCitedRow,
  type CompetitorUrlsBrandAbsentRow,
  type ContentTeamRecommendationsRow,
} from './content-impact-tables'
```

- [ ] **Step 5: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: exit 0 with no output.

- [ ] **Step 6: Commit**

```bash
git add components/report-sections/peec-ai/content-impact.tsx
git commit -m "$(cat <<'EOF'
FB-032-e: delete Content Impact §I "Which AI systems are interacting with our content?"

Tina v1 layout doc marks this section REMOVE. Drops the IIFE + the
bots alias (§I was its only caller — filteredBots stays for §A's
"Owned URLs with AI Activity" KPI), plus the AISystemsInteractingTable
+ AISystemsInteractingRow imports. totalBotVisits stays for now;
deleted with the footer in FB-032-g.
EOF
)"
```

---

## Task 6 — FB-032-f: Delete §J "What should the content team do next?"

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact.tsx`

- [ ] **Step 1: Delete the §J section IIFE**

In `components/report-sections/peec-ai/content-impact.tsx`, find the §J block (starts at `Section J` comment, ends with closing `})()}` of the IIFE, followed by the `{/* Footer */}` comment):

```tsx
      {/* ── Section J: Recommended Actions (PRD: 7-column data table) ─────── */}
      {(() => {
        const sectionJRows: ContentTeamRecommendationsRow[] = []
        if (calendarData && calendarData.rows.filter(r => r.matchStatus === 'unpublished').length > 0) {
          sectionJRows.push({
            urlOrTopic:       'Unpublished planned content',
            issueOpportunity: `${calendarData.rows.filter(r => r.matchStatus === 'unpublished').length} calendar URLs not yet live`,
            evidenceType:     'Content Calendar',
            suggestedAction:  'Prioritize publishing -- planned content generates zero AI visibility until live',
            reason:           'Unpublished content earns no citations or crawls',
            priority:         'High',
            owner:            'Content',
          })
        }
        if (agentData && agentData.topPaths.length > 0) {
          sectionJRows.push({
            urlOrTopic:       'High-crawl pages without citations',
            issueOpportunity: `${agentData.uniquePagesVisited} pages crawled by AI bots; many earn 0 citations`,
            evidenceType:     'AI Bot + Peec AI',
            suggestedAction:  'Add direct answer blocks, FAQ schema, and clearer entity definitions on top-crawled pages',
            reason:           'LLMs extract better from structured, definitional content than narrative copy',
            priority:         'Medium',
            owner:            'Content',
          })
        }
        if (filteredCompetitorDomains.length > 0) {
          sectionJRows.push({
            urlOrTopic:       'Competitor-dominated clusters',
            issueOpportunity: `${filteredCompetitorDomains.length} competitor domains cited in AI for your prompts`,
            evidenceType:     'Peec AI',
            suggestedAction:  'Create targeted content for each competitor-dominated prompt cluster',
            reason:           'Displace competitor citations with higher-quality owned content',
            priority:         'Medium',
            owner:            'Content',
          })
        }
        if (filteredEditorialDomains.length > 0) {
          sectionJRows.push({
            urlOrTopic:       'High-cite editorial outlets w/o brand mention',
            issueOpportunity: `${filteredEditorialDomains.length} editorial domains AI cites where brand is absent`,
            evidenceType:     'Peec AI',
            suggestedAction:  'Brief PR / editorial team to pitch contributed pieces, expert quotes, or data exclusives to these outlets',
            reason:           'Earned coverage on AI-trusted outlets compounds brand citation share',
            priority:         'Medium',
            owner:            'Content / PR',
          })
        }
        if (peecData && peecData.trackedPrompts.filter(p => p.visibility < 30).length > 0) {
          sectionJRows.push({
            urlOrTopic:       'Low-visibility tracked prompts',
            issueOpportunity: `${peecData.trackedPrompts.filter(p => p.visibility < 30).length} prompts where brand visibility < 30%`,
            evidenceType:     'Peec AI',
            suggestedAction:  'Write direct-answer pages targeting each low-visibility prompt: clear definition, comparison table, and named-entity references',
            reason:           'Direct-answer pages are the highest-yield format for LLM citation',
            priority:         'High',
            owner:            'Content',
          })
        }
        return (
          <ContentTeamRecommendationsTable
            rows={sectionJRows}
            emptyMessage="Connect content calendar and GA4 to generate URL-level recommendations"
          />
        )
      })()}

```

Delete the entire block.

- [ ] **Step 2: Drop the now-unused `ContentTeamRecommendationsTable` + `ContentTeamRecommendationsRow` imports**

After Task 5, the `./content-impact-tables` import block reads:

```tsx
import {
  PlannedContentPerformanceTable,
  OwnedContentCitedTable,
  CompetitorDomainsCitedTable,
  CompetitorUrlsBrandAbsentTable,
  ContentTeamRecommendationsTable,
  type PlannedContentRow,
  type OwnedContentCitedRow,
  type CompetitorDomainsCitedRow,
  type CompetitorUrlsBrandAbsentRow,
  type ContentTeamRecommendationsRow,
} from './content-impact-tables'
```

Update to (drop `ContentTeamRecommendationsTable` and `type ContentTeamRecommendationsRow`):

```tsx
import {
  PlannedContentPerformanceTable,
  OwnedContentCitedTable,
  CompetitorDomainsCitedTable,
  CompetitorUrlsBrandAbsentTable,
  type PlannedContentRow,
  type OwnedContentCitedRow,
  type CompetitorDomainsCitedRow,
  type CompetitorUrlsBrandAbsentRow,
} from './content-impact-tables'
```

- [ ] **Step 3: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: exit 0 with no output.

- [ ] **Step 4: Commit**

```bash
git add components/report-sections/peec-ai/content-impact.tsx
git commit -m "$(cat <<'EOF'
FB-032-f: delete Content Impact §J "What should the content team do next?"

Tina v1 layout doc marks this section REMOVE. Drops the IIFE + the
five heuristic row builders, plus the ContentTeamRecommendationsTable
+ ContentTeamRecommendationsRow imports.
EOF
)"
```

---

## Task 7 — FB-032-g: Delete the bottom footer (FB-030 cross-tab pre-empt)

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact.tsx`

**Why this task exists:** Tina removed an identical concatenated provenance footer from PR Influence in FB-030. The same pattern lives at the bottom of Content Impact. Delete it now so Tina doesn't flag it again on v1 review.

- [ ] **Step 1: Delete the footer `<p>` block**

In `components/report-sections/peec-ai/content-impact.tsx`, find the trailing footer block (immediately before the closing `</div>` of the outer `<div className="flex flex-col gap-6">`):

```tsx
      {/* Footer */}
      <p className="text-xs text-text-muted">
        Content Impact Tracker
        {peecData && ' · Peec AI (live)'}
        {agentData && ` · ${totalBotVisits.toLocaleString()} AI bot visits (30d)`}
        {calendarData && ` · ${calendarData.plannedCount} planned URLs (content calendar)`}
        {!calendarData && ' · Content calendar pending connection'}
        {ga4Rows ? ` · GA4 page-level data (live, ${ga4Rows.length} pages)` : ' · GA4 pending service-account access'}
      </p>
```

Delete the entire `{/* Footer */}` comment + the `<p>` block.

- [ ] **Step 2: Drop the now-fully-dead `totalBotVisits` compute**

In the same file, near line 317-319, find and delete (the footer was the last consumer after §I was removed in Task 5):

```tsx
  const totalBotVisits = models != null
    ? filteredBots.reduce((s, b) => s + b.totalVisits, 0)
    : (agentData?.totalBotVisits ?? 0)
```

- [ ] **Step 3: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: exit 0 with no output.

- [ ] **Step 4: Commit**

```bash
git add components/report-sections/peec-ai/content-impact.tsx
git commit -m "$(cat <<'EOF'
FB-032-g: delete Content Impact bottom footer (FB-030 cross-tab pre-empt)

Tina removed the same concatenated provenance footer on PR Influence in
FB-030. Same pattern lived at the bottom of Content Impact — delete it
now so it doesn't get re-flagged. Also drops the now-fully-dead
totalBotVisits compute (§I went in FB-032-e; footer was the last
consumer).
EOF
)"
```

---

## Task 8 — Dead-component cleanup in `content-impact-tables.tsx`

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact-tables.tsx`

**Why this task exists:** After Tasks 1–7, six exported components in `content-impact-tables.tsx` have zero consumers (confirmed by repo-wide grep before plan was written). Per CLAUDE.md "Avoid backwards-compatibility hacks... If you are certain that something is unused, you can delete it completely." Drop them so the file matches the live page surface.

- [ ] **Step 1: Verify zero consumers**

Run: `grep -rn "TrafficNoCitationsTable\|CitationsLittleTrafficTable\|BotAttentionNoCitationsTable\|RepeatedCompetitorPagesTable\|AISystemsInteractingTable\|ContentTeamRecommendationsTable\|TrafficNoCitationsRow\|CitationsLittleTrafficRow\|BotAttentionNoCitationsRow\|RepeatedCompetitorPagesRow\|AISystemsInteractingRow\|ContentTeamRecommendationsRow" --include="*.tsx" --include="*.ts" .`
Expected: ONLY hits inside `components/report-sections/peec-ai/content-impact-tables.tsx`. If any other file matches, STOP and surface to the controller.

- [ ] **Step 2: Delete the six dead component exports + their Row types**

In `components/report-sections/peec-ai/content-impact-tables.tsx`, delete these six entire sections (each is delimited by the `// ═══...` banner comments — delete from one banner to the next, exclusive of the next banner):

- `// 3. Traffic but No AI Citations (Section G.1)` — deletes `interface TrafficNoCitationsRow` + `export function TrafficNoCitationsTable`
- `// 4. AI Citations but Little Human Traffic (Section G.2)` — deletes `interface CitationsLittleTrafficRow` + `export function CitationsLittleTrafficTable`
- `// 5. AI Bot Attention but No Citations or Human Visits (Section G.3)` — deletes `interface BotAttentionNoCitationsRow` + `export function BotAttentionNoCitationsTable`
- `// 8. Repeated Competitor Pages Across Themes (Section H.3)` — deletes `interface RepeatedCompetitorPagesRow` + `export function RepeatedCompetitorPagesTable`
- `// 9. AI Systems Interacting with Our Content (Section I)` — deletes `interface AISystemsInteractingRow` + `export function AISystemsInteractingTable`
- `// 10. Content Team Recommended Actions (Section J)` — deletes `interface ContentTeamRecommendationsRow` + `export function ContentTeamRecommendationsTable` + the `PRIORITY_COLORS` constant declared above it

Surviving exports after cleanup (verify):
- `PlannedContentPerformanceTable` + `PlannedContentRow` (Section B — KEEP)
- `OwnedContentCitedTable` + `OwnedContentCitedRow` (Section F — KEEP)
- `CompetitorDomainsCitedTable` + `CompetitorDomainsCitedRow` (Section H.1 — KEEP)
- `CompetitorUrlsBrandAbsentTable` + `CompetitorUrlsBrandAbsentRow` (Section H.2 — KEEP)

- [ ] **Step 3: Drop now-unused tooltip keys from the `TT` constant if applicable**

After the 6 deletions, scan the `TT` object at the top of `content-impact-tables.tsx`. The kept tables (B, F, H.1, H.2) reference these keys: `sessions`, `users`, `views`, `engagementRate`, `aiReferredSessions`, `aiCitations`, `position`, `promptCoverage`, `aiEngines`, `aiBotActivity`, `matchStatus`, `contentAction`, `recommendedAction`, `postLaunchAILift`, `opportunityPriority`, `suggestedPRAngle`, `themeCoverage`, `calendarField`. The `opportunityNote` key was only used by §G.1/G.2/G.3 (the three deleted tables). Drop:

```ts
  opportunityNote:    'Why this row represents an opportunity. (Avenue Z internal.)',
```

Leave every other `TT` key untouched.

- [ ] **Step 4: Drop now-unused `Globe2` + `Sparkles` lucide imports if no surviving consumer**

After the §I + §J deletions, `Globe2` (used by AISystemsInteractingTable) and `Sparkles` (used by ContentTeamRecommendationsTable) lose their only consumers. Update the import line at the top of `content-impact-tables.tsx`:

```tsx
import { Globe2, Sparkles } from 'lucide-react'
```

to (verify by grepping the file for `Globe2` and `Sparkles` after the deletions — drop only the truly-unused ones):

```tsx
// if both unused after deletions, delete the line entirely
```

If grep shows zero hits for both icons after Step 2, delete the entire `import { Globe2, Sparkles } from 'lucide-react'` line. If only one is unused, drop just that one.

- [ ] **Step 5: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: exit 0 with no output.

- [ ] **Step 6: Commit**

```bash
git add components/report-sections/peec-ai/content-impact-tables.tsx
git commit -m "$(cat <<'EOF'
FB-032: drop dead table components from content-impact-tables.tsx

After FB-032-a..g deleted Content Impact §D/§E/§G/§H.3/§I/§J, six
table component exports (TrafficNoCitationsTable, CitationsLittleTrafficTable,
BotAttentionNoCitationsTable, RepeatedCompetitorPagesTable,
AISystemsInteractingTable, ContentTeamRecommendationsTable) and their
Row types have zero consumers. Grep-verified before deletion. Also drops
the now-unused PRIORITY_COLORS constant, opportunityNote TT key, and
Globe2 / Sparkles lucide imports.
EOF
)"
```

---

## Task 9 — Docs: feedback-log + changelog + status

**Files:**
- Modify: `docs/official-feedback/feedback-log.md`
- Modify: `docs/official-feedback/changelog.md`
- Modify: `docs/official-feedback/status.md`

- [ ] **Step 1: Add FB-032 entry to `docs/official-feedback/feedback-log.md`**

Under `## Closed`, prepend (newest at top):

```markdown
### FB-032 — Content Impact (v1) layout: delete 7 sections

**Source:** Tina's Google Doc "Content Impact Tab — Recommended layout" (3 screenshots, 2026-06-24).

**Scope:** Layout-only round. Surgical deletion of sections Tina flagged REMOVE. No adds, no renames, no content. New ADD sections (synopsis card, scatter chart, slope chart) come next round with content.

**Sub-items:**
- **FB-032-a** — Delete §D "Which delivers more lift — new content or optimization?"
- **FB-032-b** — Delete §E "Which content is decaying vs. compounding over time?"
- **FB-032-c** — Delete §G "Where is content disconnected from AI demand?" (all 3 sub-views)
- **FB-032-d** — Delete §H.3 "Which competitor pages repeat across our target themes?"
- **FB-032-e** — Delete §I "Which AI systems are interacting with our content?"
- **FB-032-f** — Delete §J "What should the content team do next?"
- **FB-032-g** — Delete the bottom concatenated footer (FB-030 cross-tab pre-empt; same pattern Tina removed on PR Influence)

**Surviving page (top → bottom):** SectionHeader → §A Snapshot KPIs → §B Watched Pages → §C Speed Stats → §F Fullsite Content Performance → §H wrapper with H.1 + H.2 (Competitor Analysis).

**Files:** `components/report-sections/peec-ai/content-impact.tsx`, `components/report-sections/peec-ai/content-impact-tables.tsx`.

**Library files untouched:** `lib/ga4/content-derive.ts` (kept — `tallyTrajectories` / `Trajectory` still consumed by `.test.ts`), `lib/peec/url-citations.ts` (kept — `urlTagNames` still consumed by `.test.ts`). Only imports in `content-impact.tsx` were dropped.

**Deferred (cataloged for next round):**
- Tina ADD: AI-generated synopsis card at top (content + FB-031 hardening pattern).
- Tina ADD: Scatter chart "AI Bot Traffic vs. Human Traffic" (content + chart wiring).
- Tina ADD: Slope chart "Which pages are gaining momentum and which are losing it?" (content + chart wiring).
- Tina ISSUE on Snapshot KPIs: "comparison period doesn't display change" — separate FB.

**Branch:** `official-feedback-content-impact-tab-v1`.
```

- [ ] **Step 2: Add FB-032 entry to `docs/official-feedback/changelog.md`**

Prepend (newest at top):

```markdown
## FB-032 — Content Impact (v1) layout deletions — 2026-06-24

- Deleted §D "Which delivers more lift — new content or optimization?" (FB-032-a)
- Deleted §E "Which content is decaying vs. compounding over time?" (FB-032-b)
- Deleted §G "Where is content disconnected from AI demand?" + all 3 sub-views (FB-032-c)
- Deleted §H.3 "Which competitor pages repeat across our target themes?" (FB-032-d)
- Deleted §I "Which AI systems are interacting with our content?" (FB-032-e)
- Deleted §J "What should the content team do next?" (FB-032-f)
- Deleted bottom concatenated footer (FB-032-g, cross-tab FB-030 pre-empt)
- Cleaned up 6 now-dead table component exports from `content-impact-tables.tsx`
- Dropped now-unused imports: `tallyTrajectories`, `Trajectory`, `urlTagNames`, `labelFromPath`, `parseDateRange`, `Globe2`, `Sparkles` (where applicable)
- Type-check clean.

**Branch:** `official-feedback-content-impact-tab-v1`.
```

- [ ] **Step 3: Update `docs/official-feedback/status.md`**

- Set Active branch to `official-feedback-content-impact-tab-v1`.
- Add FB-032 row under "In flight" with status "v1 layout deletions — code complete, awaiting PR".
- Set Next FB ID to FB-033.
- Mark Content Impact (v1) as IN FLIGHT in the per-tab workflow row.

- [ ] **Step 4: Commit**

```bash
git add docs/official-feedback/feedback-log.md docs/official-feedback/changelog.md docs/official-feedback/status.md
git commit -m "$(cat <<'EOF'
docs(feedback): FB-032 — Content Impact v1 layout deletions logged
EOF
)"
```

---

## Task 10 — Final verification + push + PR

**Files:**
- None (verification + git operations only).

- [ ] **Step 1: Final type-check**

Run: `npx tsc --noEmit`
Expected: exit 0 with no output.

- [ ] **Step 2: Verify the page renders the expected surface**

Run: `grep -n "Section [A-Z]:" components/report-sections/peec-ai/content-impact.tsx`
Expected hits: `Section A`, `Section B`, `Section C`, `Section F`, `Section H`. NO hits for D, E, G, I, J.

Run: `grep -n "TrafficNoCitationsTable\|CitationsLittleTrafficTable\|BotAttentionNoCitationsTable\|RepeatedCompetitorPagesTable\|AISystemsInteractingTable\|ContentTeamRecommendationsTable" components/report-sections/peec-ai/content-impact.tsx`
Expected: zero hits.

Run: `grep -n "Content Impact Tracker" components/report-sections/peec-ai/content-impact.tsx`
Expected: zero hits (footer string is gone).

- [ ] **Step 3: Verify cross-tab consistency**

Run: `grep -n "Content Impact Tracker\|PR Influence on AI Visibility" components/report-sections/peec-ai/`
Expected: zero hits on either footer string anywhere in the peec-ai directory.

- [ ] **Step 4: Push the branch**

```bash
git push -u origin official-feedback-content-impact-tab-v1
```

- [ ] **Step 5: Open the PR**

```bash
gh pr create --title "Content Impact v1: layout deletions (FB-032)" --body "$(cat <<'EOF'
## Summary

- Deletes 7 sections from Content Impact per Tina's v1 layout doc: §D, §E, §G (3 sub-views), §H.3, §I, §J, and the bottom concatenated footer (FB-030 cross-tab pre-empt).
- Layout-only round. No adds, no renames, no content. New ADD sections (synopsis card, scatter chart, slope chart) come in the next PR with content.
- Cleans up 6 now-dead table component exports + unused imports.
- Type-check clean. Library files untouched (tests still consume the helpers).

## Surviving page (top → bottom)

1. SectionHeader (existing)
2. §A Snapshot KPIs (8-card grid)
3. §B Watched Pages (Planned Content Performance table)
4. §C Speed Stats (Time-to-First cards)
5. §F Fullsite Content Performance (Owned Content Cited table)
6. §H Competitor Analysis (H.1 Top Competitor Domains + H.2 Brand-Absent Editorial URLs)

## Test plan

- [ ] Vercel preview loads `/dashboard/[any-client]/reports?section=peec-ai&subsection=content-impact` without errors.
- [ ] Surviving 6 sections render top-to-bottom in the listed order.
- [ ] Zero footnote/footer string at the bottom of the page.
- [ ] Demo-mode toggle: deletions apply universally (demo on + off both show the same 6-section layout).
- [ ] Model filter still works on §A KPIs + §F + §H.1 + §H.2 (date+model reactivity preserved).
- [ ] No console errors or hydration warnings.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Verify final lockstep**

```bash
git rev-parse HEAD && git rev-parse @{u} && git status --short
```
Expected: local SHA = remote SHA, working tree clean.

---

## Self-review

Cross-checked against the spec (Tina's 3 screenshots, Thomas's clarifications):

**Spec coverage — every red REMOVE line in Tina's doc mapped to a task:**
- §D "Which delivers more lift..." → Task 1 (FB-032-a) ✓
- §E "Which content is decaying..." → Task 2 (FB-032-b) ✓
- §G "Where is content disconnected..." → Task 3 (FB-032-c) ✓
- §H.3 "Which competitor pages repeat..." → Task 4 (FB-032-d) ✓
- §I "Which AI systems are interacting..." → Task 5 (FB-032-e) ✓
- §J "What should the content team do next?" → Task 6 (FB-032-f) ✓
- Footer (FB-030 cross-tab pre-empt) → Task 7 (FB-032-g) ✓

**Tina ADDs explicitly deferred (will be next round, per Thomas):**
- AI synopsis card, scatter chart, slope chart — NOT in this plan.
- Section labels ("Snapshot KPIs"/"Watched Pages"/etc.) — NOT in this plan.
- Snapshot KPIs comparison-period ISSUE — NOT in this plan.

**Type consistency:** Every `*Row` type name in delete-task code blocks matches the source (`TrafficNoCitationsRow`, `BotAttentionNoCitationsRow`, etc.). Every import path matches the live import.

**Placeholder scan:** Zero "TBD" / "implement later" / "similar to Task N" placeholders. Every code block is the actual content to delete or replace, verbatim.

**Edge cases handled:**
- Library helpers (`tallyTrajectories`, `Trajectory`, `urlTagNames`) stay alive because their `.test.ts` files still consume them — only the imports in `content-impact.tsx` get dropped. Confirmed by grep before plan was written.
- `totalBotVisits` deletion is sequenced into Task 7 (after §I AND footer are both gone) — not deleted in Task 5 alone because the footer still reads it at that point.
- `ownedHostSet` lives in two places (§E `decayOk` block + §G compute) — Task 2 deletes the §E copy, Task 3 deletes the §G copy. After both, no other section needs it.
- `filteredBots` stays — §A's "Owned URLs with AI Activity" KPI is its non-§I consumer.
- `parseDateRange` import gets dropped in Task 1 (its only §D caller goes away).
- `labelFromPath` import gets dropped in Task 3 (its §G callers go away).

**Demo-mode universality:** All deletions are in JSX itself, not behind `calendarIsDemo` gates. Demo-on and demo-off render identically.

---

## Execution Handoff

Plan complete and saved. Two execution options:

**1. Subagent-Driven (recommended)** — controller dispatches a fresh subagent per task, two-stage review (spec compliance then code quality) after each, focused fix subagent on any "Important" finding, QA surgical sweep before the wrap-up tasks.

**2. Inline Execution** — controller works through the plan in this session using `superpowers:executing-plans`, batch execution with checkpoints.

Reply `1` or `go` for subagent-driven (default). Reply `2` for inline.
