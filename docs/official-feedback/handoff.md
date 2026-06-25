# Handoff — Content Impact V2 Feedback (Tina) — plan ready, execution pending

> Copy everything below the `---` line into the new Claude Code session (Sonnet 4.6, 200k context). Persisted on branch `official-feedback-content-impact-tab-content-v2`. The full implementation plan lives at `docs/superpowers/plans/2026-06-25-content-impact-v2-feedback.md` — read it first; it is the source of truth.

---

You are resuming work on the `avenue-z-reporting-v2` repo at `/Users/thomaschangavenuez/Desktop/ave-z-reporting-official-feedback`.

## Current state (as of 2026-06-25)

- **Branch:** `official-feedback-content-impact-tab-content-v2` (cut from `main` at `a447713`)
- **Model:** Sonnet 4.6 (was Opus 4.7 in the planning session)
- **Status:** Plan is written, committed, and pushed. Zero code changes yet. Awaiting Phase 1 execution.
- **Plan file (read this FIRST):** `docs/superpowers/plans/2026-06-25-content-impact-v2-feedback.md`

## Context — what happened in the prior session

Tina returned all 16 V2 column-E items as ⚠️ (only the synopsis was ✅). The prior session ran a 5-agent forensic sweep of the entire Content Impact tab + supporting code (~2000 LOC across `content-impact.tsx`, `content-impact-tables.tsx`, `lib/peec/`, scatter + slope chart components). Two critical findings that go BEYOND Tina's explicit asks:

1. **The synopsis prose was lying.** `lib/peec/content-impact-synopsis.ts:127-135` interpolates `${d.domain} - ${d.citationCount.toFixed(1)} AI citations` — but the `citationCount` it receives at `content-impact.tsx:960, 967` is sourced from `d.citationRate` which is Peec's `citation_rate * 100` (an inflated avg, NOT a count). Glean has been writing inflated "AI citations" numbers in production. **Folded into FB-051.**

2. **§F was silently dropping subdomain pages.** The filter at `content-impact.tsx:1265-1268` does exact-host string equality. Cited URLs on `blog.renaissance.com` are dropped when Peec lists `renaissance.com` as Own. **This is the likely real cause of Tina's "only 14 pages?" complaint.** Folded into FB-050.

The plan covers all 16 V2 asks PLUS these 2 silent bugs.

## What you do FIRST

1. **Verify lockstep:**
   ```
   git branch --show-current && git fetch origin && \
   echo "local  $(git rev-parse HEAD)" && \
   echo "remote $(git rev-parse @{u})" && \
   git status --short
   ```
   Expected: on `official-feedback-content-impact-tab-content-v2`, local = remote (same SHA), clean tree.

2. **Read the plan in full:**
   ```
   cat docs/superpowers/plans/2026-06-25-content-impact-v2-feedback.md
   ```
   The plan is structured as: Goal, Architecture, Global Constraints (12), Tina coverage map, then 18 tasks across 3 phases. Each task has Files, Interfaces, and bite-sized Steps with code blocks. Tasks 1-6 = Phase 1 (5 FBs, ~80 LOC, single PR). Tasks 7-13 = Phase 2 (6 FBs, ~330 LOC, separate PR). Tasks 14-18 = Phase 3 (3 FBs, ~60 LOC, requires 1 live Peec API call first).

3. **Run baseline tests** (must all pass before Phase 1 starts):
   ```
   npx tsc --noEmit
   DATABASE_URL=postgres://test:test@localhost/test npx tsx lib/ga4/client.test.ts
   npx tsx lib/peec/bot-vs-human-scatter.test.ts
   npx tsx lib/peec/slope-chart.test.ts
   npx tsx lib/peec/url-citations.test.ts
   npx tsx lib/peec/content-impact-synopsis.test.ts
   npx tsx lib/ga4/content-derive.test.ts
   ```
   Every test must print "all assertions passed" (synopsis test prints 2 lines).

4. **Reply to Thomas verbatim:**
   > Synced on `official-feedback-content-impact-tab-content-v2` at `<SHA>`. Plan read. Baseline tests green. Ready to execute Phase 1 (FB-042, 051, 053, 054, 055) via subagent-driven-development. Confirm green-light?

5. **Wait for green-light, then invoke `superpowers:subagent-driven-development`** with the plan file path. Execute tasks 1-6 sequentially. Pause after Phase 1 PR opens for Thomas's visual QA on Vercel preview.

## Phase ordering and gates

| Phase | Tasks | FBs | LOC | Risk | Gate before next phase |
|---|---|---|---|---|---|
| **1** | 1-6 | FB-042, 051, 053, 054, 055 | ~80 | Zero (surgical) | Thomas visually QAs preview, confirms Tina's 5 specific items look right |
| **2** | 7-13 | FB-043, 044, 045, 046, 047, 049 | ~330 | Low (UI mechanical) | Thomas visually QAs preview |
| **3** | 14-18 | FB-048, 050, 052 | ~60 | Medium (subdomain change has edge cases; FB-048 path locks from Task 14 live API test) | Final V2 closeout to Tina |

## Working rules (non-negotiable — copy-paste these into every reviewer dispatch)

1. **Literal interpretation only.** If Tina did not explicitly ask, do not change.
2. **Glean for ALL LLM inference.** No actAs. No Vertex/Gemini/OpenAI/Anthropic direct calls.
3. **No em-dashes** in code, comments, copy, or docs. Commas, periods, or hyphens.
4. **Truth-grounded.** Uncomputable metric → render `--`. Never fake zero.
5. **Compare-period gating:** all deltas gate on `compareIso !== null`.
6. **GA4 `engagementRate` is a fraction [0,1].** `* 100` in BOTH renderer AND delta math.
7. **Never skip hooks. Never force-push. No Neon migrations without Paul approval.**
8. **Before adding cross-cutting plumbing, grep siblings.**
9. **Cache version bump required** when Peec response type shape changes. Currently `v8`; Phase 1 FB-051 bumps to `v9`.
10. **One commit per task.** Tasks are independently reviewable.
11. **Type-check + 6 tests before every commit / PR open.**
12. **Sheet rows go in columns F, G, H** (V2 — What shipped / V2 — Accepted? / V2 — Your feedback) at `/Users/thomaschangavenuez/Downloads/Reporting Dash Feedback (Thomas Score Card) - Content Impact Tab (1).csv`. Leave G + H blank; Tina fills.

## Tina V2 → FB coverage map (16 of 16)

| Tina V2 ask | FB | Phase |
|---|---|---|
| Row 3: Prompt Coverage delta missing | FB-042 | 1 |
| Row 4-a: §B `--` rows confusing | FB-043 | 2 |
| Row 4-b: §B delta columns sortable | FB-044 | 2 |
| Row 5: §C show source URLs | FB-045 | 2 |
| Row 6-a: §D 4 quadrants not visible | FB-046 | 2 |
| Row 6-b: §D hover should show URL | FB-047 | 2 |
| Row 6-c: §D should honor date range | FB-048 | 3 |
| Row 7: §E right legend + hover muting | FB-049 | 2 |
| Row 8-a: §F delta columns sortable | FB-044 | 2 |
| Row 8-b: §F only 14 pages, should be more | FB-050 | 3 |
| Row 9-a: §H.1 Citation Share 199.9% bug | FB-051 | 1 |
| Row 9-b: §H.1 only 7 competitors | FB-052 | 3 |
| Row 9-c: §H.1 "AI Visibility" wrong | FB-053 | 1 |
| Row 9-d: §H.1 Citation Share tooltip wrong | FB-054 | 1 |
| Row 9-e: §H.1 delta columns sortable | FB-044 | 2 |
| Row 10: §H.2 Citation Share tooltip wrong | FB-055 | 1 |

## Tooling reference

- `npx tsc --noEmit` (zero output = clean)
- `npx tsx <file>.test.ts` (NOT vitest); `client.test.ts` needs `DATABASE_URL=postgres://test:test@localhost/test`
- `vercel logs <preview-url> --since 1h --expand` (authed as `thomaschang-avez`)
- `vercel ls avenue-z-reporting-v2 --yes` to list deployments
- `gh pr view <N> --repo Avenue-Z/avenue-z-reporting-v2` for PR state

## Thomas's posture

Correctness above all. QA sweeps. Receipts. No assumptions, no decisions beyond Tina's literal ask. If implied but not explicit, ASK before acting. Sheet Column F should answer Tina's question directly (paste-ready). All copy: no em-dashes, plain language. He is stressed — his job depends on this round closing cleanly. Earn trust by surfacing risk honestly, not by promising perfection.

## After all 3 phases merge

- Update `status.md` (commits ahead, next FB ID = FB-056)
- Send Slack to Tina with the 3 PR URLs + a 2-line summary of what shipped
- Confirm Vercel production is serving merged branch
- Replace this handoff doc with a "V2 SHIPPED" version pointing at the merge SHA
