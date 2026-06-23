# Handoff Prompt — Post-Compaction Resume (PR Influence v2 round)

Copy everything below the `---` line into the new Claude Code session. It is self-contained and gives the new session everything it needs to continue exactly where this one left off.

---

You are picking up an in-flight workstream on the `avenue-z-reporting-v2` repo. Working directory: `/Users/thomaschangavenuez/Desktop/ave-z-reporting-official-feedback`.

## State at handoff (2026-06-23, late afternoon)

- **Currently on:** `main` at `1d8d9e9` (just-merged Overview v2 batch via PR #63). Local = remote. Working tree clean.
- **Last batch shipped:** Overview v2 — closed every ⚠️ row in Tina's Overview-tab v1 scorecard CSV.
  - **FB-020** (CSV E2) — Subtitle removed from Overview SectionHeader.
  - **FB-021** (CSV E12) — Tracked-prompts chart deleted from both Peec + Profound Overviews.
  - **FB-022** (CSV E7) — YTD visibility chart fetch + initial `clients.firstTrackedAt` DB column path.
  - **FB-023** (CSV E11) — Live Winners/Losers, reactive to date AND model filter, sandbox lifted, 16 unit tests.
  - **FB-024** — Cleanup on FB-022 after Paul declined Neon migration: pinned YTD `end_date` to today, dropped "Tracking began" line entirely, reverted DB column + migration + prop threading. No Neon touch.
- **Next FB ID:** **FB-025.**
- **Next round:** **PR Influence v2** — Tina has additional feedback on the PR Influence tab. Branch not yet cut.

## First moves — do these IMMEDIATELY before any code work

1. **Read these files in order:**
   1. `CLAUDE.md` (project conventions)
   2. `docs/official-feedback/status.md` (cross-tab workflow state — fully up to date)
   3. `docs/official-feedback/changelog.md` (terse SHA lookups for every shipped FB; newest at top)
   4. `docs/official-feedback/feedback-log.md` (full decision logs; newest at top under `## Closed`)
   5. `docs/official-feedback/tina-scorecard.csv` (Overview-tab v1 scorecard — Tina accepted all 4 v2 fixes; this CSV is now historical)
   6. `~/.claude/projects/-Users-thomaschangavenuez-Desktop-ave-z-reporting-official-feedback/memory/MEMORY.md` (Glean-only LLM rule, etc.)

2. **Verify lockstep:**
   ```
   git branch --show-current && git fetch origin && \
   echo "local  $(git rev-parse HEAD)" && \
   echo "remote $(git rev-parse @{u})" && \
   git status --short
   ```
   Expected: branch `main`, local SHA = remote SHA = `1d8d9e9` (or later if hotfixes landed), working tree clean.

3. **Reply to Thomas with this exact greeting:**
   > Synced. On `main` at `1d8d9e9` (Overview v2 batch merged via PR #63, every ⚠️ row closed). Next FB ID is FB-025. PR Influence v2 round is next. **Ready when you are — paste Tina's PR Influence feedback (CSV, Google Doc, or screenshot) and I'll cut the branch + work the plan.** Same surgical literal-only interpretation as Overview v2.

4. **Wait for Tina's feedback before any code work.** Do NOT cut a branch or write a plan until Thomas pastes the actual feedback.

## When Tina's feedback arrives — the workflow

This is the exact pattern that landed Overview v2 cleanly. Follow it verbatim.

1. **Cut the branch from current main:**
   ```
   git checkout main && git pull origin main --ff-only && \
   git checkout -b official-feedback-pr-influence-v2
   ```

2. **Read every line of code on the PR Influence tab before planning.** Key files (subject to change — verify by greping):
   - `components/report-sections/peec-ai/pr-influence.tsx`
   - `components/report-sections/peec-ai/pr-influence-tables.tsx`
   - `components/report-sections/peec-ai/pr-influence-synopsis.tsx`
   - `components/report-sections/peec-ai/sentiment-insights.tsx`
   - `lib/peec/pr-influence-synopsis.ts`
   - Data layer in `lib/peec/client.ts` (the PR-Influence-specific aggregations)

3. **Invoke `superpowers:writing-plans` to write a full implementation plan** at `docs/superpowers/plans/2026-06-NN-pr-influence-v2-iteration.md`. Plan must have:
   - Source feedback table (verbatim CSV / doc text)
   - Literal-interpretation policy section
   - File structure mapping
   - One task per FB with complete code blocks (no placeholders)
   - Self-review section
   - Task 5 (final verification + PR)

4. **Confirm the plan with Thomas. He'll say `go` / `1` / `2`.**
   - `go` or `1` → use `superpowers:subagent-driven-development` (one fresh subagent per FB, recommended).
   - `2` → use `superpowers:executing-plans` (inline sequential with checkpoints).

5. **Per-FB workflow (the surgical loop that worked perfectly on Overview v2):**
   - Dispatch implementer subagent with the full task text from the plan (do NOT make subagent read the plan file — paste the task verbatim).
   - Subagent does code + tests + docs + commit + SHA backfill.
   - **Run a QA surgical sweep immediately after each FB** (Thomas's standing rule). Quick output: git log, working tree, tsc, tests, grep for orphan references, diff stats. Present as a checklist table.
   - Mark task complete, move to next FB.

6. **After all FBs ship:** update `status.md`, push branch, open PR with the standard template.

7. **Throughout:** every FB → `feedback-log.md` decision log (newest at top under `## Closed`) + `changelog.md` one-line entry (newest at top) + `tina-scorecard.csv` column F update (if Tina-facing) + commit.

## Working rules — non-negotiable (carried over from Overview v2)

1. **Literal interpretation only.** Tina's words drive the implementation. No reinterpretation. No "future enhancement" punts on things she explicitly named. If she names date AND model, ship both. If she gives a date, show that date (or remove the line if no source available — never fake one).
2. **Glean Chat API for all LLM inference.** Helper: `gleanChat()` in `lib/glean.ts`. Token is a Glean USER token — do NOT pass `actAs`.
3. **No em-dashes in any copy you write.** Periods or commas only. The em-dash in existing `### FB-NNN —` headings is structural convention, not copy.
4. **Universal across clients for design/UX changes. Sandbox-gate to Avenue Z only when content is hardcoded Avenue Z data.** When wiring live data, lift the gate (FB-023 set this precedent).
5. **Truth-grounded data only.** No proxies, no derivations that ship wrong numbers. `--` with an honest tooltip when a metric isn't computable; never an invented value.
6. **Rule #11: Recommended layout = full spec.** Anything currently rendering on the tab that is NOT in Tina's recommended layout gets removed by default.
7. **Rule #13: Literal text over interpretive text.** Use Tina's exact words.
8. **Paul rule: No Neon migrations without explicit Paul approval.** FB-022 → FB-024 was the lesson. Find non-DB solutions when possible.
9. **One user message = one FB.** Multi-part asks become FB-NNN-a/b/c.
10. **Every FB: full decision log + changelog one-liner + scorecard CSV column F update (if applicable) + commit + SHA backfill commit.**
11. **QA surgical sweep after every FB.** Show receipts: tsc, tests, grep, file:line refs, commit SHAs.
12. **Never skip hooks. Never force-push without explicit user instruction.**

## Tooling reminders

- `npx tsc --noEmit` for type checks (zero output = clean).
- `npx tsx <test-file>.test.ts` for running individual tests (repo uses `node:assert` + `tsx`, NOT vitest — verify if you write new tests).
- CSV writes via Python `csv` module (curly quotes + embedded newlines in some cells; hand-editing breaks the file).
- `git rm` for file deletions (NOT plain `rm` followed by `git add`).
- Drizzle migrations: generate with `npx drizzle-kit generate`. DO NOT run `migrate` against Neon without Thomas confirming Paul approves.

## What's parked (do NOT touch this session)

- **Content Impact branch:** `official-feedback-content-impact-tab` parked (docs-only diff). Resume when Tina sends Content Impact feedback.
- **Technical Performance tab:** not started. Fresh branch when Tina is ready.

## Thomas's posture

He cares about correctness above all else. He'll ask for QA sweeps and confirmations. Match that with calm, surgical execution. Show receipts. No deviation from the plan once it's locked. No reinterpretation of Tina's words.

Standing by. Awaiting Tina's PR Influence v2 feedback to begin.
