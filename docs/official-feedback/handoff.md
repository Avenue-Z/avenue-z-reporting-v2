# Handoff — Content Impact (content v1) post-compaction resume

> Copy everything below the `---` line into the new Claude Code session. It is self-contained and gives the new session everything it needs to continue exactly where this one left off. Also persisted to this file on the branch as the durable recovery path.

---

You are picking up an in-flight workstream on the `avenue-z-reporting-v2` repo. Working directory: `/Users/thomaschangavenuez/Desktop/ave-z-reporting-official-feedback`.

## State at handoff (2026-06-24, end of session)

- **Currently on:** `official-feedback-content-impact-tab-content-v1` at `cca90c6` (local = remote). 27 commits ahead of `main` (`ffae4dc`). Working tree clean.
- **PR:** [#77](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/77) — open. Title: *Content Impact content v1: AI Executive Synopsis (FB-033) + §A KPI swap & delta fix (FB-034) + Watched Pages overhaul (FB-035)*.
- **Next FB ID:** **FB-036**.

## What shipped in this round (chronological commits since `d83d771` baseline)

### FB-033 — Content Impact AI Executive Synopsis card
- `fc66a93`, `054c718`, `30570d1`, `91e27f6`, `b34b3bd` + docs `e02348e`. Glean-backed, FB-031 four-layer hardened. Mounted between demo badge and §A.

### FB-034 — §A Snapshot KPIs swap (8 → 4) + comparison-period delta wiring
- Implementation: `989e5d1` → `10b88dc` → `7845dbf` → `16a117b` → `3e9a940` → `9fccb2e`
- Polish: `e2997d0` (em-dash scrub)
- Revert: `741dc69` (reverted 2 overreaches: §A header copy + `'previous_period'` default fallback)
- Hotfix #1: `b0c1afd` (validator Rule 2 removed; false-positive on per-domain prose; cache bumped `v2-glean-ci-kpi-swap → v3-glean-ci-rule2-removed`)
- Hotfix #2: `a4a3d12` (Citation Share delta gate on `compareIso`)
- Docs: `d83d771`

### FB-035 — Watched Pages table overhaul (9 columns + comparison deltas + strict published filter)
- `58590d1` Task 1 (coverage `promptIdsByUrlKey` + `dateRange` opt; cache v3→v4 for coverage, v2→v3 for citations)
- `e652673` Task 2 (`SortableTable` defaultSortKey/defaultSortDir)
- `b5e48f6` Task 3 (wired `compareRange` to `ContentImpactReport` at dashboard route — fixes silently-broken FB-034 §A deltas)
- `fcb8ec0` Task 4 (4 new GA4 queries + 2 new Peec prior fetches)
- `a013127` Tasks 5+6 (per-row metrics × periods + deltas + strict `status==='published'` filter + 9-column table rebuild)
- `76f88e2`, `46cd794` Task 7 (docs + plan archive + commits-ahead count fix)

### FB-035 hotfix #1 — `compareRange` resolution bug
- `0485065` hotfix: `parseDateRange(compareRange)` → `deriveCompareRange(mainRangeStr, compareRange)`. The old code passed the magic string `'previous_period'` to `parseDateRange`, which fell through to its last-30-days default, returning the SAME window as the main range. Every comparison-period delta therefore computed to exactly 0.0% / 0.0 pp across §A AND Watched Pages rows. Bug originated in FB-034 Task 2 (`10b88dc`); FB-035 amplified it across 5 per-row deltas.
- `cca90c6` regression test (`lib/ga4/client.test.ts`) + docs. Pins parseDateRange canary + deriveCompareRange behavior across all 3 date-picker values + custom: passthrough + unknown-mode null guard.

## Surviving Content Impact page (top → bottom)

1. SectionHeader (unchanged)
2. Executive Synopsis card (FB-033, cached `v3-glean-ci-rule2-removed`)
3. **§A KPI strip** — header "How is content performing at a glance?" → 4 cards: **Citation Share / Prompt Coverage / AI Referral Traffic / Organic Traffic**. Deltas appear only when comparison period explicitly toggled.
4. **§B Watched Pages (FB-035)** — title: "Which planned content pieces are actually earning AI-driven engagement?". 9 columns. Strict literal `status === 'published'` filter. Pagination at 10. Default sort Citation Share desc. Inline deltas on 5 metrics when comparison period is on.
5. §C Speed Stats
6. §F Fullsite Content Performance
7. §H Competitor Analysis — H.1 + H.2 only

## First moves after compaction

1. **Read these files in order (use Read, not Explore):**
   1. `CLAUDE.md`
   2. `docs/official-feedback/status.md`
   3. `docs/official-feedback/handoff.md` (full version of this prompt)
   4. `docs/official-feedback/changelog.md` (FB-035 hotfix + tasks + FB-034 hotfix #2 + #1 + revert + polish are top)
   5. `docs/official-feedback/feedback-log.md` (FB-035 + FB-034 + FB-033 are top under Closed)
   6. `docs/superpowers/plans/2026-06-24-watched-pages-table-overhaul.md`
   7. `docs/superpowers/plans/2026-06-24-content-impact-synopsis-card.md`
   8. `docs/superpowers/plans/2026-06-24-content-impact-snapshot-kpis-swap.md`
   9. `~/.claude/projects/-Users-thomaschangavenuez-Desktop-ave-z-reporting-official-feedback/memory/MEMORY.md`
   10. `components/report-sections/peec-ai/content-impact.tsx`
   11. `components/report-sections/peec-ai/content-impact-tables.tsx`
   12. `lib/peec/url-citations.ts`
   13. `lib/ga4/client.ts` (parseDateRange + deriveCompareRange semantics)
   14. `lib/ga4/client.test.ts` (regression test — locks the FB-035 hotfix)

2. **Verify lockstep:**
   ```
   git branch --show-current && git fetch origin && \
   echo "local  $(git rev-parse HEAD)" && \
   echo "remote $(git rev-parse @{u})" && \
   echo "main   $(git rev-parse origin/main)" && \
   git status --short
   ```
   Expected: branch `official-feedback-content-impact-tab-content-v1`, local = remote = `cca90c6` (or later), main `ffae4dc` (or later), working tree clean.

3. **Run all tests + tsc:**
   ```
   npx tsc --noEmit
   DATABASE_URL=postgres://test:test@localhost/test npx tsx lib/ga4/client.test.ts
   npx tsx lib/peec/url-citations.test.ts
   npx tsx lib/peec/content-impact-synopsis.test.ts
   npx tsx lib/ga4/content-derive.test.ts
   ```
   Expected: tsc clean; all 4 test files end with their "all assertions passed" line. The dummy DATABASE_URL is only needed for `client.test.ts` (ga4/client.ts top-level imports the DB module; the test itself never hits the DB).

4. **Reply to Thomas with this greeting (verbatim):**

   > Synced. On `official-feedback-content-impact-tab-content-v1` at `cca90c6`. FB-033 (synopsis card) + FB-034 (4 KPI cards + delta wiring) + FB-035 (Watched Pages 9-column overhaul) all shipped on PR [#77](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/77). Last action: FB-035 hotfix #1 — preview at `46cd794` showed every comparison-period delta reading exactly 0.0%; root-caused to `parseDateRange(compareRange)` falling through to the last-30-days default for `'previous_period'` / `'previous_year'` magic strings. Fixed at `0485065` by swapping to `deriveCompareRange(mainRangeStr, compareRange)`. Regression test at `cca90c6` pins the bug pattern. Next FB ID is FB-036. **Awaiting your next move — scatter chart "AI Bot Traffic vs. Human Traffic" or slope chart "Which pages are gaining momentum"?** Reminder: literal interpretation only. I won't change anything Tina didn't explicitly ask for.

5. **Wait for Thomas.** Do NOT scaffold proactively.

## What Tina wants next (deferred ADDs from FB-032)

- 🟢 **Scatter chart "AI Bot Traffic vs. Human Traffic"** — verbatim subtitle: *"See which pages are being crawled most by AI systems and how that compares with the human traffic those pages generate."* 4 quadrants.
- 🟢 **Slope chart "Which pages are gaining momentum and which are losing it?"** — verbatim subtitle: *"Track the biggest movers over time to see which URLs are compounding, which are decaying, and where content performance is strengthening or slipping."* Toggle buttons: AI Referral Traffic / Organic Search Traffic / Citation Share.

## Working rules — non-negotiable

1. **Literal interpretation only.** If Tina didn't explicitly ask for it, don't change it. No assumptions, no inferences, no "spirit of the ask."
2. **Glean Chat API for ALL LLM inference.** `gleanChat()` in `lib/glean.ts`. Do NOT pass `actAs`.
3. **FB-031 hardening pattern** for any new Glean-backed prose. **Validator patterns must be SPECIFIC, not broad.**
4. **No em-dashes anywhere** in new code, copy, prompt text, source-code comments, or docs prose. Use commas or hyphens.
5. **Truth-grounded only.** If a metric is uncomputable, omit the delta line. Never fake "+0%."
6. **Plan-first** via `superpowers:writing-plans` → `superpowers:subagent-driven-development`.
7. **One user message = one FB.** Multi-part = `FB-NNN-a/b/c`. Hotfixes share the parent FB ID.
8. **Every FB:** feedback-log entry (with `**Sheet row:**` line) + changelog row + status.md update + commit + push.
9. **Vercel preview is truth.** `vercel logs <preview-url> --since 1h --expand`. Authenticated as `thomaschang-avez`.
10. **Never skip hooks. Never force-push.**
11. **Paul rule:** No Neon migrations without explicit Paul approval.
12. **NEW — before adding data plumbing, grep siblings.** Before touching `compareRange` / `dateRange` / any cross-cutting symbol in a report file, grep the same symbol across `components/report-sections/`. If the file you are editing handles it differently than its peers, that is a question not a feature. This was the lesson from FB-035 hotfix #1.

## Known limitations (documented)

- **Prompt Coverage delta deferred** — `urlPromptIds` is now per-URL (FB-035 Task 1), and `getDomainCoverage` accepts a `dateRange` opt. Prior-period coverage is fetched in FB-035 Task 4 when `compareIso !== null`. If `coveragePrior.promptIdsByUrlKey` is empty (Peec returns no per-URL prompt data for the prior period), the row delta gracefully hides. Watch in preview; if Tina wants always-on, add a fallback.
- **Validator Rule 2 removed** — see hotfix `b0c1afd`. If a real total-misreporting bug appears, future FB can add a narrower pattern requiring explicit "total" phrasing.

## Tooling reminders

- `npx tsc --noEmit` (zero output = clean)
- `npx tsx <file>.test.ts` (NOT vitest); `client.test.ts` needs `DATABASE_URL=postgres://test:test@localhost/test`
- `vercel logs <preview-url> --since 1h --expand` (already authenticated as `thomaschang-avez`)
- `vercel ls avenue-z-reporting-v2 --yes` to list previews

## Thomas's posture

Correctness above all. QA sweeps. Receipts. **No assumptions, no decisions beyond Tina's literal ask, no hallucination.** If something is implied but not explicit, ASK before acting. The FB-035 hotfix slip taught the codebase the grep-siblings lesson — apply it.

Standing by. Awaiting Thomas's next ADD (scatter chart or slope chart) to begin FB-036.
