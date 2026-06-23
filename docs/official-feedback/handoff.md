# Handoff Prompt — Post-Compaction Resume (Overview v2 ready to execute)

Copy everything below the `---` line into the new Claude Code session. It is self-contained and gives the new session everything it needs to continue exactly where this one left off.

---

You are picking up an in-flight session on the `avenue-z-reporting-v2` repo. Working directory: `/Users/thomaschangavenuez/Desktop/ave-z-reporting-official-feedback`.

## State at handoff (2026-06-23)

- **Branch:** `official-feedback-overview-v2` (cut from `origin/main`).
- **HEAD:** `6884eb3` (local = remote, working tree clean, ZERO code touched yet).
- **Base:** `origin/main` at `a2d39b3`.
- **Plan is fully written, committed, pushed, and locked.** Path: `docs/superpowers/plans/2026-06-23-overview-v2-iteration.md`. Every step has complete code blocks + exact file:line targets + exact shell commands + expected outputs. The plan was authored under the `superpowers:writing-plans` skill.
- **Thomas is anxious and needs perfection.** He explicitly said: *"there should be absolutely NO open ended questions. what's on the feedback is what is needed to be done."* and *"I'll get fired if anything is wrong."* The plan is locked to LITERAL interpretation of Tina's CSV — no Plan A/B, no "future enhancements", no deferred sub-asks. Do not deviate.

## The four Tina asks (source of truth — verbatim from `/Users/thomaschangavenuez/Downloads/Reporting Dash Feedback (Thomas Score Card) - Overview Tab.csv`)

| CSV cell | Tina's verbatim feedback | FB ID | Literal action |
|---|---|---|---|
| **E2** ⚠️ | *"REMOVE: Subtitle 'Visibility, share of voice, and sentiment across tracked LLMs, with side-by-side comparison to competitors.'"* | **FB-020** | Delete the `subtitle="..."` prop on `<SectionHeader>` at `components/report-sections/peec-ai/index.tsx:203`. Make `subtitle` optional in `section-header.tsx`. |
| **E7** ⚠️ | *"'Tracking began May 18' is incorrect, this workspace has been tracking data since March 28, 2025. ... Please make static to always show YTD."* | **FB-022** | (1) Visibility chart truly YTD: separate YTD trend fetch in both `lib/peec/client.ts` + `lib/profound/client.ts`; route `dailyVisibility` to it. (2) Show correct date: add `clients.firstTrackedAt` DB column + Drizzle migration; backfill Avenue Z to `2025-03-28`; thread through to `<VisibilityChart>` which formats + displays from DB. |
| **E11** ⚠️ | *"This seems like static copy and should be pulling actual data. It doesn't change when a new date range or model is selected..."* | **FB-023** | Live Winners/Losers reacting to BOTH date range AND model filter. Model-dimension the prompt fetches (current + prior) with limit 5000. New `lib/peec/winners-losers.ts` with `applyModelFilter(prompts, models)` + `computeWinnersLosers(flat)`. RSC chains them with active `models` prop. Sandbox gate LIFTED (every client sees live data). Empty state for thin history. |
| **E12** (free-standing) | *"REMOVE Chart: 'Which prompts are AI engines answering with our brand?' at the very bottom. ... not included in the recommended layout."* | **FB-021** | Delete chart render from both Peec + Profound Overview RSCs. Delete both component files. KEEP `data.trackedPrompts` field (consumed by 6+ other surfaces — PR Influence, Content Impact, AI summaries, etc.). |

## CRITICAL — what NOT to do

- ❌ Do NOT drop the "Tracking began" line entirely. Tina gave us the correct date — show it.
- ❌ Do NOT defer model-filter reactivity. She named both date AND model — ship both.
- ❌ Do NOT keep the Winners/Losers sandbox gate. Lifting it is required for "actual data" per other clients.
- ❌ Do NOT touch any other tab (PR Influence is shipped; Content Impact + Technical Performance are out of scope this round).
- ❌ Do NOT invent new asks or "improve" beyond literal CSV text.
- ❌ Do NOT skip the firstTrackedAt DB column work — it's the literal fix for E7's date.
- ❌ Do NOT skip the model-dimensioned prompt fetches — they're the literal fix for E11's "or model".

## First moves — do these IMMEDIATELY before any code work

1. **Read these files in order:**
   1. `CLAUDE.md` (project conventions)
   2. `docs/superpowers/plans/2026-06-23-overview-v2-iteration.md` (the FULL plan — this is the source of truth for execution)
   3. `docs/official-feedback/status.md` (cross-tab workflow state)
   4. `docs/official-feedback/changelog.md` (terse SHA lookups for prior FBs)
   5. `docs/official-feedback/feedback-log.md` (full decision logs for prior FBs)
   6. `docs/official-feedback/tina-scorecard.csv` (v1 scorecard — Tina has added the v2 columns F/G/H but they're empty until v2 ships)
   7. `~/.claude/projects/-Users-thomaschangavenuez-Desktop-ave-z-reporting-official-feedback/memory/MEMORY.md` (Glean-only LLM rule, etc.)

2. **Verify lockstep:**
   ```
   git branch --show-current && \
   git fetch origin && \
   echo "local  $(git rev-parse HEAD)" && \
   echo "remote $(git rev-parse @{u})" && \
   git status --short
   ```
   Expected:
   - branch: `official-feedback-overview-v2`
   - local SHA = remote SHA = `6884eb3` (or later if more docs commits land)
   - working tree clean

3. **Reply to Thomas with this exact greeting:**
   > Read the plan + state docs. Branch `official-feedback-overview-v2` confirmed, HEAD matches origin, working tree clean. Plan is locked at literal-only interpretation — 4 FBs (FB-020 / FB-021 / FB-022 / FB-023) mapped to the 4 ⚠️ rows in your CSV. **Ready to execute.** Pick execution mode: (1) subagent-driven (one fresh subagent per FB, fastest), or (2) inline sequential with checkpoints. Say `1`, `2`, or `go` (defaults to 1).

4. **Wait for Thomas's `go` / `1` / `2` before touching any code.**

## Execution mode (pick when Thomas says go)

- **Subagent-driven (default if `go` or `1`):** Use `superpowers:subagent-driven-development`. One fresh subagent per FB, review between each, fastest iteration. Required sub-skill.
- **Inline sequential (`2`):** Use `superpowers:executing-plans`. Run FBs sequentially in this session with checkpoint pauses between each. Required sub-skill.

## Working rules — non-negotiable (from prior sessions)

1. **One user message = one FB group.** Sub-items become FB-NNN-a/b/c if multiple.
2. **Next FB ID:** **FB-020.** Next four are FB-020 → FB-023. FB-024 is the next-after-Overview-v2 reservation.
3. **Avenue Z sandbox rule:** Layout/design/UX changes go universal; hardcoded Avenue Z data gates to `clientSlug === 'avenue-z'`. (FB-023 LIFTS the gate on Winners/Losers because the cards are no longer hardcoded.)
4. **Truth-grounded data only.** No proxies, no derivations that ship wrong numbers.
5. **No em-dashes in copy you write.** Periods or commas.
6. **Glean Chat API for ALL LLM inference.** Helper: `gleanChat()` in `lib/glean.ts`. User-token caveat: don't pass `actAs` unless you have a global token.
7. **Universal across clients (with sandbox exception only for hardcoded content).**
8. **Every FB gets a full decision log** in `feedback-log.md` + one-line entry in `changelog.md` + scorecard CSV column F update.
9. **Show receipts:** file:line refs, commit SHAs, command outputs.
10. **🔴 Recommended layout = full spec (Rule #11).** Tina's recommended layout is the COMPLETE spec — anything not in it gets removed. Applied to FB-021 (tracked-prompts chart removal).
11. **Tina is direct. Treat her words as authoritative intent.**
12. **Literal text over interpretive text (Rule #13).** Use Tina's exact words. (This is what we corrected for FB-022 + FB-023.)

## What's parked (do NOT touch this session)

- **Content Impact branch:** `official-feedback-content-impact-tab` parked at HEAD `6616a0b`. Docs-only diff (no code). Resume when Tina sends Content Impact feedback.
- **PR Influence branch:** `official-feedback-pr-influence-tab` parked at HEAD `54eb970`. Fully shipped to main via PRs #52 + #58. Kept alive for any future iteration.

## When all 4 FBs ship and tests pass

The plan's "Task 5 — Final verification, docs lockstep, push" covers it: update `status.md`, push branch, open PR with the title `Overview v2: Tina CSV feedback (FB-020 through FB-023)`. Body template is in the plan. The CSV scorecard (column F `V2 — What shipped`) will already be filled per the per-FB tracker steps.

## Thomas's last words this session

He's anxious. He emphasized:
- *"this is vital and needs to be done correctly"*
- *"i cant stress the importance enough"*
- *"surgical and perfect"*
- *"i'll get fired if anything is wrong"*

Match that energy with calm, surgical execution. No deviation from the plan. No reinterpretation. No questions that the CSV already answers.

Standing by — go execute.
