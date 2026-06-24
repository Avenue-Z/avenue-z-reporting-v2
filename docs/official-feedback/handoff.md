# Handoff — Content Impact (content v1) post-compaction resume

> Copy everything below the `---` line into the new Claude Code session. It is self-contained and gives the new session everything it needs to continue exactly where this one left off. Also persisted to this file on the branch as the durable recovery path.

---

You are picking up an in-flight workstream on the `avenue-z-reporting-v2` repo. Working directory: `/Users/thomaschangavenuez/Desktop/ave-z-reporting-official-feedback`.

## State at handoff (2026-06-24, end of session)

- **Currently on:** `official-feedback-content-impact-tab-content-v1` at `a4a3d12` (local = remote). 14 commits ahead of `main` (`ffae4dc`). Working tree clean.
- **PR:** [#77](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/77) — open. Title: *Content Impact content v1: AI Executive Synopsis (FB-033) + §A KPI swap & delta fix (FB-034)*.
- **Next FB ID:** **FB-035**.

## What shipped in this round (full history on the branch)

### FB-033 — Content Impact AI Executive Synopsis card (top of tab)

Tina's verbatim ask: *"AI-generated synopsis of overall performance & recommended actions during the period, executive overview style."*

5 implementation commits + 1 docs commit:

| Task | SHA | What |
|---|---|---|
| 1 | `fc66a93` | Scaffolded `lib/peec/content-impact-synopsis.ts` (types + validator Rule 1) + test file (FIRST assertion = FB-031 analog regression) |
| 2 | `054c718` | Validator Rules 2 (AI citations) + 3 (owned domains cited) + tests |
| 3 | `30570d1` | `buildContext()` + Glean prompt + 3-tier JSON extractor + retry-on-violation (max 2) + `cached()` wrapper |
| 4 | `91e27f6` | `components/report-sections/peec-ai/content-impact-synopsis.tsx` RSC |
| 5 | `b34b3bd` | Mount in `content-impact.tsx`: build `synopsisContext` from same expressions §A KPIs use + mirror §H.2 live filter |
| docs | `e02348e` | feedback-log + changelog + status.md + plan archive |

### FB-034 — §A Snapshot KPIs swap (8 cards → 4) + comparison-period delta wiring

Tina's verbatim ask: *"Change these KPIs to: Citation Share, Prompt Coverage, AI Referral Traffic, Organic Traffic."* + ISSUE: *"Right now, when you have a comparison period turned on, it doesn't display change."*

5 implementation + 1 docs + 4 hotfix/polish commits:

| Task / fix | SHA | What |
|---|---|---|
| 1 | `989e5d1` | Extended local `KpiCard` with `delta?: number` + `invertDelta?: boolean` props (arrow + magnitude + "vs previous period") |
| 2 | `10b88dc` | Accept `compareRange?: string` on `ContentImpactReport` (page router was passing it but the component was ignoring, root cause of the ISSUE). Add 2 GA4 queries (`sessionSource × sessionDefaultChannelGroup`) for main + prior |
| 3 | `7845dbf` | Compute 4 new KPI values + deltas |
| 4 | `16a117b` | Swap §A JSX from 8 cards to 4 + demo-mode hardcodes |
| 5 | `3e9a940` | Refactor `ContentImpactSynopsisContext` (drop 6 orphans, add 7 new KPI fields + supporting). Bump cache `v1-glean-ci → v2-glean-ci-kpi-swap` |
| docs | `9fccb2e` | feedback-log + changelog + status.md + plan archive |
| polish | `e2997d0` | Scrub 2 em-dashes from source-code comments |
| revert | `741dc69` | **Two overreaches reverted** to adhere literally to Tina's ask: (a) §A header restored from "Snapshot KPIs" back to original "How is content performing at a glance?"; (b) Removed `deriveCompareRange('previous_period')` fallback so deltas show only when user explicitly turns on a comparison period |
| hotfix #1 | `b0c1afd` | **Removed validator Rule 2.** Vercel logs (`vercel logs <preview-url>`) showed `totalAiCitations mismatch: prose claims "3,196 AI citations" but context.totalAiCitations = 105239`. Glean was writing legitimate per-domain prose; Rule 2's regex was ambiguous. Cache bumped `v2-glean-ci-kpi-swap → v3-glean-ci-rule2-removed`. Added regression test |
| hotfix #2 | `a4a3d12` | **Citation Share delta gate fix.** Peec returns prior values unconditionally, so Citation Share delta was showing even when comparison period was OFF. Now ALL 3 deltable KPIs gate on `compareIso !== null` |

### Surviving Content Impact page (top → bottom)

1. `SectionHeader` (unchanged)
2. `Executive Synopsis` card (FB-033, Glean-backed, FB-031-hardened, cached `v3-glean-ci-rule2-removed`)
3. **§A KPI strip** — header "How is content performing at a glance?" → 4 cards: **Citation Share / Prompt Coverage / AI Referral Traffic / Organic Traffic**. Deltas show only when user toggles a comparison period via the date picker.
4. §B Watched Pages (FB-032 surviving)
5. §C Speed Stats (FB-032 surviving)
6. §F Fullsite Content Performance (FB-032 surviving)
7. §H Competitor Analysis — H.1 + H.2 only (FB-032 stripped H.3)

## Vercel preview verification status

Last preview deployed at HEAD `a4a3d12`. The hotfix at `b0c1afd` was diagnosed via `vercel logs` showing the Rule 2 false positive. The `a4a3d12` follow-up gating Citation Share's delta is a pure logic change.

**Visual checks for the preview at `a4a3d12`:**

1. §A renders exactly 4 cards in order: Citation Share → Prompt Coverage → AI Referral Traffic → Organic Traffic.
2. §A header reads "How is content performing at a glance?" (NOT "Snapshot KPIs").
3. With **no comparison period** toggled on, ALL 4 cards show value only, no delta line.
4. Toggle a comparison period on via the date picker → delta lines appear on Citation Share + AI Referral Traffic + Organic Traffic. Prompt Coverage stays delta-less by design.
5. Executive Synopsis card at the top renders real prose with recommended actions.

If GA4 prior period returns 0 sessions, AI Referral Traffic + Organic Traffic deltas stay hidden even with comparison period on — truth-grounded behavior, not a bug.

## Known limitations (documented)

- **Prompt Coverage delta deferred** — `getDomainCoverage(clientSlug)` at `lib/peec/url-citations.ts:286` does not accept a `dateRange` arg. Card renders value-only. Future FB will refactor.
- **Validator Rule 2 removed** — see hotfix `b0c1afd`. If a real total-misreporting bug appears, future FB can add a narrower pattern that requires explicit "total" phrasing.

## What Tina wants next in this round (deferred ADDs from FB-032)

- 🟢 **Scatter chart "AI Bot Traffic vs. Human Traffic"** — verbatim subtitle: *"See which pages are being crawled most by AI systems and how that compares with the human traffic those pages generate."* 4 quadrants. **Awaiting Thomas content.**
- 🟢 **Slope chart "Which pages are gaining momentum and which are losing it?"** — verbatim subtitle: *"Track the biggest movers over time to see which URLs are compounding, which are decaying, and where content performance is strengthening or slipping."* Toggle buttons: AI Referral Traffic / Organic Search Traffic / Citation Share. **Awaiting Thomas content.**

## Working rules — non-negotiable

1. **Literal interpretation only.** If Tina didn't explicitly ask for it, don't change it. Lessons from this session: I overstepped on §A header copy and on the `'previous_period'` default; both reverted in `741dc69`.
2. **Glean Chat API for ALL LLM inference.** `gleanChat()` in `lib/glean.ts`. Token is USER. Do NOT pass `actAs`.
3. **FB-031 hardening pattern** for any new Glean-backed prose: `(USE THESE EXACT VALUES)` labels + `Data integrity (strict)` prompt rule + post-Glean validator + retry-on-violation (max 2) + cache version bump on any prompt/schema change. **Validator patterns must be SPECIFIC, not broad** (lesson from Rule 2 removal: broad patterns produce false positives when context has multiple values using the same units).
4. **No em-dashes anywhere** in new code, copy, prompt text, or source-code comments. Periods or commas only.
5. **Truth-grounded only.** If a metric is uncomputable, show value alone with no delta line. Never fabricate "+0%" or fake delta.
6. **Plan-first.** Use `superpowers:writing-plans` before code. Plans live at `docs/superpowers/plans/2026-06-NN-*.md`.
7. **Subagent-driven dispatch.** Use `superpowers:subagent-driven-development`. One fresh subagent per task.
8. **One user message = one FB.** Multi-part = `FB-NNN-a/b/c`. Hotfixes share the parent FB ID.
9. **Every FB:** feedback-log entry (with `**Sheet row:**` line for Tina's Google Sheet export) + changelog row + status.md update + commit + push.
10. **Vercel preview is truth.** Use `vercel logs <preview-url> --since 1h --expand` to pull function logs when something looks off. Authenticated as `thomaschang-avez`.
11. **Never skip hooks.** No `--no-verify`. Never force-push.
12. **Cross-tab pre-empts** — when fixing one tab, audit the others for the same pattern.
13. **Paul rule:** No Neon migrations without explicit Paul approval.
14. **Branch naming:** `-tab-format-vN` for deletions, `-tab-content-vN` for ADDs.

## Tooling reminders

- **Tests:** `npx tsx <file>.test.ts`. Repo uses `node:assert` + `tsx`, NOT vitest.
- **Type-check:** `npx tsc --noEmit` (zero output = clean).
- **Vercel logs:** `vercel logs <deployment-url> --since 1h --expand` (already authenticated). For synopsis diagnostics: `vercel logs <url> 2>&1 | grep -iE "content-impact|synopsis|glean"`.
- **List previews:** `vercel ls avenue-z-reporting-v2 --yes`.
- **Drizzle:** `npx drizzle-kit generate` to author. NO `migrate` against Neon without Paul approval.

## First moves after compaction

1. **Read these files in order (use Read, not Explore):**
   1. `CLAUDE.md`
   2. `docs/official-feedback/status.md`
   3. `docs/official-feedback/handoff.md` (this doc)
   4. `docs/official-feedback/changelog.md` (FB-034 + FB-033 are top entries)
   5. `docs/official-feedback/feedback-log.md` (FB-034 + FB-033 are top under Closed)
   6. `docs/superpowers/plans/2026-06-24-content-impact-synopsis-card.md` (FB-033 plan)
   7. `docs/superpowers/plans/2026-06-24-content-impact-snapshot-kpis-swap.md` (FB-034 plan)
   8. `~/.claude/projects/-Users-thomaschangavenuez-Desktop-ave-z-reporting-official-feedback/memory/MEMORY.md`
   9. `components/report-sections/peec-ai/content-impact.tsx` (orchestrator)
   10. `lib/peec/content-impact-synopsis.ts` (Glean-backed synopsis with Rules 1 + 3 only)

2. **Verify lockstep:**

   ```
   git branch --show-current && git fetch origin && \
   echo "local  $(git rev-parse HEAD)" && \
   echo "remote $(git rev-parse @{u})" && \
   echo "main   $(git rev-parse origin/main)" && \
   git status --short
   ```

   Expected: branch `official-feedback-content-impact-tab-content-v1`, local SHA = remote SHA = `a4a3d12` (or later), main `ffae4dc` (or later), working tree clean.

3. **Reply to Thomas with this greeting (verbatim):**

   > Synced. On `official-feedback-content-impact-tab-content-v1` at `a4a3d12`. FB-033 (synopsis card) + FB-034 (4 KPI cards + delta wiring) both shipped on PR [#77](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/77). Last actions: removed validator Rule 2 (false-positive on per-domain prose, fixed synopsis empty-state) and gated Citation Share delta on `compareIso` so deltas only show when comparison period is explicitly toggled on. Next FB ID is FB-035. **Awaiting your next move — scatter chart "AI Bot Traffic vs. Human Traffic" or slope chart "Which pages are gaining momentum"?** Reminder: literal interpretation only. I won't change anything Tina didn't explicitly ask for.

4. **Wait for Thomas.** Do NOT scaffold proactively.

## Reusable assets shipped (canonical patterns to copy)

- `lib/peec/pr-influence-synopsis.ts` — FB-031 hardened Glean prose (canonical 4-layer pattern).
- `lib/peec/content-impact-synopsis.ts` — FB-031 hardened with narrower validator (Rules 1 + 3 only after Rule 2 removal lesson).
- `lib/peec/sentiment-insights.ts` — Glean-backed live classifier over `UrlCitation[]`.
- `lib/peec/winners-losers.ts` — per-period per-model compute reactive to filters.
- `lib/peec/url-citations.ts` — per-URL citation rows, date-scopable.
- `lib/ga4/content-derive.ts` — trajectory/timing/median helpers.

## Thomas's posture

Correctness above all. QA sweeps. Receipts. **No assumptions, no decisions beyond Tina's literal ask, no hallucination.** If something is implied but not explicit, ASK before acting. Cares deeply about cross-tab pre-empts + FB-031 hardening + plan-first + subagent-driven dispatch.

Standing by. Awaiting Thomas's next ADD (scatter chart or slope chart) to begin FB-035.
