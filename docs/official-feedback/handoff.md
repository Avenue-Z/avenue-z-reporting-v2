# Handoff Prompt — Post-Compaction Resume (Content Impact v1 round)

Copy everything below the `---` line into the new Claude Code session. It is self-contained and gives the new session everything it needs to continue exactly where this one left off.

---

You are picking up an in-flight workstream on the `avenue-z-reporting-v2` repo. Working directory: `/Users/thomaschangavenuez/Desktop/ave-z-reporting-official-feedback`.

## State at handoff (2026-06-23, end of day)

- **Currently on:** `main` at `f6fd533` (PR Influence v2 batch just merged via PR #64). Local = remote. Working tree clean.
- **Last batch shipped:** PR Influence v2 — closed every ⚠️ row in Tina's PR Influence v1 scorecard CSV (R2, R4, R5, R14, R16, R17, R23) + R24 REMOVE ask, plus FB-031 4-layer guardrails after a Vercel-preview Glean-contradiction bug.
  - **FB-025** (CSV R2) — Synopsis decimals fix + strict format rule + cache bump.
  - **FB-026** (CSV R4 + R5) — Sentiment Insights live, date + model reactive, sandbox lifted, 11 unit tests.
  - **FB-027** (CSV R14) — Prompt Clusters dynamic X-axis (next 5 / next 10).
  - **FB-028** (CSV R15 ✅ + R16 + R17) — Top Editorial Opportunities: Tina's R15 5-column shape preserved verbatim; URL-level brand-absent with `mentionsYourBrand=false`; `classification === 'editorial'` filter with host fallback; honest URL-level Citation Share + Delta of Citation Share via new prior-period URL fetch; broken filters dropped; cap raised 20→50.
  - **FB-029** (CSV R23 REVISION) — PR Placement Matchback restored under Exec Summary with Tina's literal title + subtitle.
  - **FB-030** (CSV R24) — Bottom footnote deleted.
  - **FB-031** — 4-layer Glean-contradiction hardening: prompt integrity rule + `validateSynopsisGrounding` validator + retry-on-violation + cache flush. Production-bug regression test is the first assertion in `lib/peec/pr-influence-synopsis.test.ts`.
- **Next FB ID:** **FB-032.**
- **Next round:** **Content Impact (v1)** — Tina has not yet sent Content Impact feedback. Branch not yet cut.

## First moves — do these IMMEDIATELY before any code work

1. **Read these files in order:**
   1. `CLAUDE.md`
   2. `docs/official-feedback/status.md` (fully up to date as of `f6fd533`)
   3. `docs/official-feedback/handoff.md` (source of truth for this prompt)
   4. `docs/official-feedback/changelog.md` (newest at top)
   5. `docs/official-feedback/feedback-log.md` (newest at top under `## Closed`)
   6. `docs/official-feedback/tina-scorecard.csv` (PR Influence v1 + v2 acceptance log)
   7. `~/.claude/projects/-Users-thomaschangavenuez-Desktop-ave-z-reporting-official-feedback/memory/MEMORY.md` (memory index)
   8. `~/.claude/projects/.../memory/project_content_impact_preempt.md` (the FB-031 footnote pre-empt for Content Impact — load before Content Impact work begins)

2. **Verify lockstep:**
   ```
   git branch --show-current && git fetch origin && \
   echo "local  $(git rev-parse HEAD)" && \
   echo "remote $(git rev-parse @{u})" && \
   git status --short
   ```
   Expected: `main`, local SHA = remote SHA = `f6fd533` (or later if hotfixes landed), working tree clean.

3. **Reply to Thomas with this exact greeting:**
   > Synced. On `main` at `f6fd533` (PR Influence v2 batch merged via PR #64; every ⚠️ row closed plus FB-031 hardening shipped). Next FB ID is FB-032. Content Impact (v1) is next. **Ready when you are — paste Tina's Content Impact feedback (CSV, Google Doc, or screenshot) and I'll cut the branch + write the plan.** Reminder I have a pre-empt queued: at the start of Content Impact work, delete the trailing concatenated footnote at `content-impact.tsx:1279-1285` (same pattern Tina just removed on PR Influence via FB-030).

4. **Wait for Tina's feedback before any code work.** Do NOT cut a branch or write a plan until Thomas pastes the actual feedback.

## When Tina's feedback arrives — the workflow

The exact pattern that landed Overview v2 (PR #63) and PR Influence v2 (PR #64) cleanly. Follow it verbatim.

1. **Cut the branch from current main:**
   ```
   git checkout main && git pull origin main --ff-only && \
   git checkout -b official-feedback-content-impact-tab
   ```
   (If the parked `official-feedback-content-impact-tab` branch exists with stale docs-only state, decide: rebase on main or delete + recreate. Default: delete + recreate from current main.)

2. **Apply the FB-031 footnote pre-empt as the first sub-item (FB-032-pre-empt or FB-032-a):**
   - Delete the trailing `<p>` block at `content-impact.tsx:1279-1285`
   - Decision log + changelog + commit + SHA backfill — same per-FB ritual as PR Influence v2.

3. **Read every line of code on the Content Impact tab before planning.** Key files (verify by greping `components/report-sections/peec-ai/content-impact*` and `lib/peec/content-impact*` if exists):
   - `components/report-sections/peec-ai/content-impact.tsx`
   - `components/report-sections/peec-ai/content-impact-tables.tsx`
   - Data layer in `lib/peec/client.ts` (Content-Impact-specific aggregations) + `lib/peec/url-citations.ts`

4. **Invoke `superpowers:writing-plans` to write a full implementation plan** at `docs/superpowers/plans/2026-06-NN-content-impact-v1-iteration.md`. Plan must have:
   - Source feedback table (verbatim CSV / doc text from Tina)
   - Literal-interpretation policy section
   - File structure mapping
   - One task per FB with complete code blocks (no placeholders)
   - Self-review section
   - Final task (verification + PR)

5. **Confirm the plan with Thomas. He'll say `go` / `1` / `2`.**
   - `go` or `1` → `superpowers:subagent-driven-development` (one fresh subagent per FB, recommended).
   - `2` → `superpowers:executing-plans` (inline sequential).

6. **Per-FB workflow (the surgical loop):**
   - Dispatch implementer subagent with the full task text from the plan (do NOT make the subagent read the plan file — paste the task verbatim).
   - Subagent does code + tests + docs + commit + SHA backfill.
   - **Run a spec compliance review subagent immediately after**, then a code quality review subagent if spec passes.
   - **Run a QA surgical sweep** (Thomas's standing rule): git log, working tree, tsc, tests, grep for orphan references, diff stats. Present as a checklist table.
   - On any code-quality "Important" finding, dispatch a focused fix subagent before moving on (precedent: FB-026 I1+I3 fix `79ad31c`, FB-028 follow-up `9eaa991`).
   - Mark task complete, move to next FB.

7. **After all FBs ship:** update `status.md`, push branch, open PR with the standard template.

8. **Throughout:** every FB → `feedback-log.md` decision log (newest at top under `## Closed`) + `changelog.md` one-line entry (newest at top) + `tina-scorecard.csv` column F update (if Tina-facing) + commit + SHA backfill commit.

## Working rules — non-negotiable (carried across the entire workstream)

1. **Literal interpretation only.** Tina's words drive the implementation. No reinterpretation. No "future enhancement" punts on things she explicitly named.
2. **Glean Chat API for all LLM inference.** Helper: `gleanChat()` in `lib/glean.ts`. Token is a Glean USER token. Do NOT pass `actAs`.
3. **FB-031 hardening pattern for ALL new Glean-backed prose.** If you create or modify a Glean call: (a) section labels in the data section get `(USE THESE EXACT VALUES)`, (b) prompt includes a `Data integrity (strict)` rule, (c) post-Glean call runs through a `validateXxxGrounding(output, context)` validator scanning for numeric contradictions, (d) on validation failure retry once with the violations enumerated; on second failure throw so the component shows a graceful empty state, (e) cache version is bumped whenever the prompt structure changes. See `lib/peec/pr-influence-synopsis.ts` as the canonical implementation.
4. **No em-dashes in any copy you write.** Periods or commas only. The em-dash in existing `### FB-NNN —` headings is structural convention.
5. **Universal across clients for design / UX changes. Sandbox-gate to Avenue Z only when content is hardcoded Avenue Z data.** When wiring live data, lift the gate (FB-023 + FB-026 precedents).
6. **Truth-grounded data only.** No proxies, no derivations that ship wrong numbers. `--` with an honest tooltip when a metric isn't computable; never an invented value.
7. **Rule #11: Recommended layout = full spec.** When Tina sends a "Recommended layout" mockup, treat it as the COMPLETE spec. Anything currently rendering on the tab that is NOT in her recommended layout gets removed by default.
8. **Rule #13: Literal text over interpretive text.** Use Tina's exact words for titles, subtitles, column labels, copy.
9. **Paul rule: No Neon migrations without explicit Paul approval.** FB-022 → FB-024 was the lesson. Find non-DB solutions when possible.
10. **One user message = one FB.** Multi-part asks become FB-NNN-a/b/c.
11. **Every FB: full decision log + changelog one-liner + scorecard CSV column F update (if applicable) + commit + SHA backfill commit.**
12. **QA surgical sweep after every FB.** Show receipts: tsc, tests, grep, file:line refs, commit SHAs.
13. **Never skip hooks. Never force-push without explicit user instruction.**
14. **Cross-tab pre-empts.** When a bug Tina flagged on tab X has the same pattern on tab Y you haven't worked on yet, fix it proactively BEFORE Tina sees Y for the first time. Saved to memory as `project_<context>_preempt.md` for handoff durability. Current pre-empts:
    - `project_content_impact_preempt.md` — footnote at `content-impact.tsx:1279-1285` (FB-030 precedent, FB-032 sub-item).

## Tooling reminders

- `npx tsc --noEmit` for type checks (zero output = clean).
- `npx tsx <test-file>.test.ts` for running individual tests (repo uses `node:assert` + `tsx`, NOT vitest — verify if you write new tests).
- CSV writes via Python `csv` module (curly quotes + embedded newlines in some cells; hand-editing breaks the file).
- `git rm` for file deletions (NOT plain `rm` followed by `git add`).
- Drizzle migrations: generate with `npx drizzle-kit generate`. DO NOT run `migrate` against Neon without Thomas confirming Paul approves.
- Vercel preview is the truth: spot-check after every batch ships. Hard-refresh (`Cmd+Shift+R`) bypasses browser cache.

## Reusable assets shipped this workstream

- **`lib/peec/synopsis.ts`** — Glean-backed Overview synopsis (Peec + Profound providers). Already uses `.toFixed(1)` everywhere. **Does NOT yet have FB-031 guardrails.** If Tina ever flags a contradiction here, lift the pattern from `pr-influence-synopsis.ts`.
- **`lib/peec/pr-influence-synopsis.ts`** — Canonical FB-031 hardened pattern: prompt integrity rule + exported `validateSynopsisGrounding` + retry-on-violation + cache version + 13 tests in `pr-influence-synopsis.test.ts`. Copy this pattern for any new Glean prose surface.
- **`lib/peec/sentiment-insights.ts`** — Glean-backed sentiment classifier with `applyEnginesFilter` + `modelKeyOf` helpers. Cache-keyed on `(clientSlug, dateRange, modelKey)`.
- **`lib/peec/winners-losers.ts`** — `applyModelFilter` + `computeWinnersLosers` helpers. 16 tests.
- **`lib/peec/url-citations.ts`** — Per-URL `UrlCitation[]` with `mentionsYourBrand`, `classification`, `competitorBrandNames`, `engines[]`. Date-scopable via `{ startDate, endDate }` opts. Cache-keyed on args (so different periods produce different keys).
- **`components/report-sections/peec-ai/section-header.tsx`** — Canonical AEO section header. Subtitle is optional.

## What's parked (do NOT touch this session)

- **PR Influence v1 branches** (`official-feedback-pr-influence-tab`): historical, merged via #52 + #58. Reference only.
- **Overview v1 branches** (`official-feedback-overview-tab`, `fix/llm-visibility-bar-scale`, `fix/sandbox-avenue-z-static-content`): historical, merged. Reference only.
- **Technical Performance tab**: not started. Fresh branch when Tina is ready.
- **Profound parity on Winners/Losers** (FB-023 open follow-up): requires Profound API to expose per-prompt-per-model rows; separate FB when needed.
- **Overview synopsis FB-031 hardening retrofit**: same risk pattern exists in `lib/peec/synopsis.ts` but Tina has never flagged it there. Apply the validator pattern if she does, or proactively during a future Overview iteration.

## Thomas's posture

Correctness above all else. He'll ask for QA sweeps and confirmations. Match with calm, surgical execution. Show receipts. No deviation once plan is locked. No reinterpretation of Tina's words.

He cares deeply about:
- Tina not getting frustrated by us shipping the same bug twice across different tabs (cross-tab pre-empts solve this).
- Every commit being traceable to a Tina row + a code line.
- Sheet column F text being brief, plain English, no jargon, no internal-engineering details Tina doesn't need.

Standing by. Awaiting Tina's Content Impact (v1) feedback to begin.
