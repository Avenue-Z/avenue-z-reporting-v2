# Handoff — Content Impact (content v1) post-compaction resume

> Copy everything below the `---` line into the new Claude Code session. Persisted to this file on the branch as the durable recovery path.

---

You are picking up an in-flight workstream on the `avenue-z-reporting-v2` repo. Working directory: `/Users/thomaschangavenuez/Desktop/ave-z-reporting-official-feedback`.

## State at handoff (2026-06-25)

- **Branch:** `official-feedback-content-impact-tab-content-v1` at `b7c7590` (local = remote). 43 commits ahead of `main` (`2c7db77`). Working tree clean.
- **PR:** [#77](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/77), open.
- **Next FB ID:** **FB-040**.

## What shipped this round

| FB | What | Position |
|---|---|---|
| **FB-033** | Executive Synopsis card (Glean, FB-031 hardened) | top of tab |
| **FB-034** | §A 4 KPI cards (Citation Share / Prompt Coverage / AI Referral / Organic) + delta wiring | §A |
| **FB-035** | §B Watched Pages: 9-col URL table, strict `status==='published'` filter, paginate 10, default sort Citation Share desc, 5 metric deltas | §B |
| **FB-036** | §C Speed Stats validation (real GA4, no LLM) + subtitle copy fix (was overclaiming "AI citation or bot crawl") | §C |
| **FB-037** | §D Bot vs Human scatter (4 median-split quadrants, always-on last-30, zero new fetches for bot side) | §D |
| **FB-038** | §E Slope chart with 3-toggle (AI Referral / Organic / Citation Share), top 15 by abs delta, compare-period gated | §E |
| **FB-039** | §F Fullsite Content Performance: drop legacy 9-col domain-row, replace with 6-col URL-row (Page hyperlinked + 5 metrics with deltas) | §F |

Notable mid-round fixes baked in:
- **FB-035 hotfix #1 (`0485065`):** `parseDateRange(compareRange)` falls through to default last-30 for `'previous_period'` / `'previous_year'` magic strings, making every delta read 0. Fixed by swap to `deriveCompareRange(mainRangeStr, compareRange)`. Regression test at `lib/ga4/client.test.ts`.
- **FB-034 hotfix #1 (`b0c1afd`):** validator Rule 2 false-positive on per-domain prose. Rule removed, cache bumped.
- **FB-034 hotfix #2 (`a4a3d12`):** Citation Share delta now gates on `compareIso !== null`. Tina's literal "when comparison turned on" honored.
- **FB-039 hotfix (`202073c`):** §F engagement rate value renderer + delta both × 100 to match §B (GA4 returns fraction [0,1]).

## Current Content Impact page top → bottom

1. SectionHeader
2. Executive Synopsis (FB-033, cached `v3-glean-ci-rule2-removed`)
3. **§A** "How is content performing at a glance?" → 4 KPI cards
4. **§B** "Which planned content pieces are actually earning AI-driven engagement?" → 9-col table
5. **§C** "How quickly does new content earn traffic and AI citations?" → 4 Speed Stats tiles
6. **§D** "AI Bot Traffic vs. Human Traffic" → scatter chart with 4 quadrants
7. **§E** "Which pages are gaining momentum and which are losing it?" → slope chart with 3-toggle
8. **§F** "What content across your domain is being cited by AI?" → 6-col URL table
9. **§H** "Which competitor or third-party pages are cited for our prompts?" → H.1 + H.2

## First moves after compaction

1. **Read in order (use Read, not Explore):**
   - `CLAUDE.md`
   - `docs/official-feedback/status.md`
   - `docs/official-feedback/handoff.md` (this file)
   - `docs/official-feedback/changelog.md`
   - `docs/official-feedback/feedback-log.md`
   - The 5 plan files in `docs/superpowers/plans/` (synopsis card, KPI swap, watched pages, scatter, slope, fullsite)
   - `~/.claude/projects/-Users-thomaschangavenuez-Desktop-ave-z-reporting-official-feedback/memory/MEMORY.md`
   - `components/report-sections/peec-ai/content-impact.tsx`
   - `components/report-sections/peec-ai/content-impact-tables.tsx`
   - `components/report-sections/peec-ai/bot-vs-human-scatter.tsx`
   - `components/report-sections/peec-ai/slope-chart.tsx`
   - `lib/peec/bot-vs-human-scatter.ts`
   - `lib/peec/slope-chart.ts`
   - `lib/peec/url-citations.ts`
   - `lib/ga4/client.ts` + `lib/ga4/client.test.ts` (FB-035 hotfix regression)

2. **Verify lockstep:**
   ```
   git branch --show-current && git fetch origin && \
   echo "local  $(git rev-parse HEAD)" && \
   echo "remote $(git rev-parse @{u})" && \
   echo "main   $(git rev-parse origin/main)" && \
   git status --short
   ```
   Expected: branch `official-feedback-content-impact-tab-content-v1`, local = remote = `b7c7590` (or later), main = `2c7db77` (or later), clean tree.

3. **Run tsc + 6 test files:**
   ```
   npx tsc --noEmit
   DATABASE_URL=postgres://test:test@localhost/test npx tsx lib/ga4/client.test.ts
   npx tsx lib/peec/bot-vs-human-scatter.test.ts
   npx tsx lib/peec/slope-chart.test.ts
   npx tsx lib/peec/url-citations.test.ts
   npx tsx lib/peec/content-impact-synopsis.test.ts
   npx tsx lib/ga4/content-derive.test.ts
   ```
   Expected: tsc empty; every test prints `all assertions passed`.

4. **Reply to Thomas verbatim:**

   > Synced. On `official-feedback-content-impact-tab-content-v1` at `b7c7590`. FB-033 through FB-039 all shipped on PR [#77](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/77). Tab is now: Synopsis, §A KPIs, §B Watched Pages, §C Speed Stats, §D Scatter, §E Slope, §F Fullsite, §H Competitor. Next FB ID is FB-040. Standing by for your next move. Literal interpretation only.

5. **Wait for Thomas.** Do not scaffold proactively.

## Working rules (non-negotiable)

1. **Literal interpretation only.** If Tina didn't explicitly ask, don't change.
2. **Glean Chat API for ALL LLM inference.** `gleanChat()` in `lib/glean.ts`. No `actAs`.
3. **FB-031 hardening pattern** for any Glean-backed prose. Validator patterns SPECIFIC.
4. **No em-dashes anywhere** in any new code, comment, copy, docs. Commas or hyphens.
5. **Truth-grounded.** Uncomputable metric → omit / render `--`. Never fake zero.
6. **Plan-first** via `superpowers:writing-plans` → `superpowers:subagent-driven-development`.
7. **One user message = one FB.** Multi-part = `FB-NNN-a/b/c`. Hotfixes share parent FB ID.
8. **Every FB:** feedback-log + changelog + status.md + sheet row + commit + push.
9. **Vercel preview is truth.** `vercel logs <preview-url> --since 1h --expand`. Authenticated as `thomaschang-avez`.
10. **Never skip hooks. Never force-push.**
11. **Paul rule:** No Neon migrations without explicit Paul approval.
12. **Before adding cross-cutting data plumbing, grep siblings.** If the file you are editing handles a symbol (`compareRange`, `dateRange`, units like fraction-vs-percent) differently than its peers, that is a question not a feature. Lesson from FB-035 hotfix #1 AND FB-039 hotfix (engagement rate units).

## Cross-section unit gotcha (recently bit us)

GA4 returns `engagementRate` as a fraction in `[0, 1]`. §B `(r.engagementRate * 100).toFixed(1)%` and `(er - erPrior) * 100`. §F NOW matches after FB-039 hotfix `202073c`. **If you add another section that consumes engagementRate, multiply by 100 in BOTH the value renderer AND the delta.** Same goes for any other GA4 metric that returns as a fraction.

## Tooling reminders

- `npx tsc --noEmit` (zero output = clean)
- `npx tsx <file>.test.ts` (NOT vitest); `client.test.ts` needs `DATABASE_URL=postgres://test:test@localhost/test`
- `vercel logs <preview-url> --since 1h --expand` (authenticated as `thomaschang-avez`)
- `vercel ls avenue-z-reporting-v2 --yes` to list previews

## Thomas's posture

Correctness above all. QA sweeps. Receipts. No assumptions, no decisions beyond Tina's literal ask. If implied but not explicit, ASK before acting. Sheet Column F should answer Tina's question directly (paste-ready). All copy: no em-dashes, plain language.

Standing by. PR [#77](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/77) is in flight with the full Content Impact v1 content round.
