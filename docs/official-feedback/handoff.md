# Handoff Prompt — Post-Compaction Resume (Content Impact CONTENT v1 round)

Copy everything below the `---` line into the new Claude Code session. It is self-contained and gives the new session everything it needs to continue exactly where this one left off.

---

You are picking up an in-flight workstream on the `avenue-z-reporting-v2` repo. Working directory: `/Users/thomaschangavenuez/Desktop/ave-z-reporting-official-feedback`.

## State at handoff (2026-06-24, end of session)

- **Currently on:** `official-feedback-content-impact-tab-content-v1` at `1babb01` (= main; **zero commits ahead** because no FB-033 work has started yet). Local = remote. Working tree clean.
- **Last batch shipped:** Content Impact (format) v1 — layout-only deletion round. Merged via [PR #74](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/74) at merge commit `1babb01` on 2026-06-24. FB-032 sub-items FB-032-a through FB-032-h plus a dead-component cleanup commit:
  - **FB-032-a** (`46c00cc`) — Delete §D "Which delivers more lift…"
  - **FB-032-b** (`5ff00a3`) — Delete §E "Which content is decaying…"
  - **FB-032-c** (`923edea`) — Delete §G entire wrapper + 3 sub-views
  - **FB-032-d** (`d3fef39`) — Delete §H.3 "Repeated competitor pages…"
  - **FB-032-e** (`5644c5d`) — Delete §I "Which AI systems are interacting…"
  - **FB-032-f** (`126dcc8`) — Delete §J "What should the content team do next?"
  - **FB-032-g** (`d0f5e32`) — Delete bottom concatenated footer (FB-030 cross-tab pre-empt applied)
  - **FB-032-h** (`7e8514a`) — Code-quality follow-ups: deleted DEAD §E prior-period GA4 query (wasted one real GA4 round-trip per render), dropped 2 unused imports, dropped dead `action` field, scrubbed 7 orphan comments
  - `7ff0e6b` — Dead-component cleanup in `content-impact-tables.tsx` (-532 lines)
- **Branch naming convention now in use:** `official-feedback-<tab>-tab-format-v1` (layout/deletion round) and `official-feedback-<tab>-tab-content-v1` (content/ADDs round). Anticipates `-format-v2`, `-content-v2`, etc.
- **Next FB ID:** **FB-033** (this is where Thomas's Content Impact content feedback enters).

## Surviving Content Impact page (post-FB-032, top → bottom)

1. `SectionHeader` (existing — "How is content performing across AI and human channels?")
2. **§A** Snapshot KPIs — 8-card grid (Planned URLs, Live URLs, Total Sessions, AI Citations, AI-Referred Sessions, Owned URLs with AI Activity, % Null/Unmatched, Owned Domains Cited in AI)
3. **§B** Watched Pages — Planned Content Performance table (16 cols)
4. **§C** Speed Stats — 4 Time-to-First cards
5. **§F** Fullsite Content Performance — Owned Content Cited table (9 cols)
6. **§H** Competitor Analysis — wrapper containing H.1 (Top Competitor Domains) + H.2 (Brand-Absent Editorial URLs) only

Library files `lib/ga4/content-derive.ts` and `lib/peec/url-citations.ts` are INTENTIONALLY untouched — their `.test.ts` files still consume `tallyTrajectories` / `Trajectory` / `urlTagNames`. Only the imports in `content-impact.tsx` were dropped.

## What Tina expects in this content round (her layout doc, deferred from FB-032)

- 🟢 **ADD: AI-generated synopsis** at the top of the page ("AI-generated synopsis of overall performance & recommended actions during the period, executive overview style"). Apply the **FB-031 hardening pattern from day one** (canonical reference: `lib/peec/pr-influence-synopsis.ts`): section labels marked `(USE THESE EXACT VALUES)`, `Data integrity (strict)` prompt rule, post-Glean `validateXxxGrounding(output, context)` validator, retry-on-violation (max 2) throwing to empty-state on failure, cache version bump on prompt change.
- 🟢 **ADD: Scatter Plot Chart of Site Pages by Bot Traffic vs. Human Traffic.** Title: "AI Bot Traffic vs. Human Traffic". Subtitle (verbatim): "See which pages are being crawled most by AI systems and how that compares with the human traffic those pages generate." 4 quadrants: High Bot/Low Human, High Bot/High Human, Low Bot/Low Human, Low Bot/High Human.
- 🟢 **ADD: Ranked Slope Chart of Top Site Pages With Toggle Buttons for AI Referral Traffic, Organic Search Traffic, Citation Share.** Title: "Which pages are gaining momentum and which are losing it?". Subtitle (verbatim): "Track the biggest movers over time to see which URLs are compounding, which are decaying, and where content performance is strengthening or slipping."
- ⬜ **Section labels** Tina wrote in her doc: "Snapshot KPIs" / "Watched Pages" / "Speed Stats" / "Fullsite Content Performance" / "Competitor Analysis". Thomas to confirm whether these become on-page section headers OR stay as Tina's doc-organization labels.
- 🟡 **ISSUE on Snapshot KPIs:** "Right now, when you have a comparison period turned on, it doesn't display change." Separate FB — KPI delta-wiring bug, not layout.

Order on page when ADDs land: AI synopsis card (NEW, top) → §A Snapshot KPIs → §B Watched Pages → §C Speed Stats → **NEW Scatter** → **NEW Slope** → §F Fullsite Content Performance → §H Competitor Analysis (H.1 + H.2).

## First moves — do these IMMEDIATELY

1. **Read these files in order (use the Read tool, not Explore — full context matters):**
   1. `CLAUDE.md`
   2. `docs/official-feedback/status.md` (top sections — current as of `1babb01`)
   3. `docs/official-feedback/handoff.md` (this file, source of truth)
   4. `docs/official-feedback/changelog.md` (newest at top — FB-032 is top entry)
   5. `docs/official-feedback/feedback-log.md` (newest at top under `## Closed` — FB-032 is top entry)
   6. `docs/superpowers/plans/2026-06-24-content-impact-v1-iteration.md` (the just-shipped layout plan — useful context for how the file was reshaped)
   7. `~/.claude/projects/-Users-thomaschangavenuez-Desktop-ave-z-reporting-official-feedback/memory/MEMORY.md`
   8. `components/report-sections/peec-ai/content-impact.tsx` (the live RSC; read it end-to-end so you understand the post-FB-032 surface before adding anything)
   9. `components/report-sections/peec-ai/content-impact-tables.tsx` (the 4 surviving table components)
   10. `lib/peec/pr-influence-synopsis.ts` (canonical FB-031 hardening pattern — copy this shape for the new AI synopsis)
   11. `lib/peec/sentiment-insights.ts` (canonical Glean-backed live data pattern — copy this shape if needed)

2. **Verify lockstep:**
   ```
   git branch --show-current && git fetch origin && \
   echo "local  $(git rev-parse HEAD)" && \
   echo "remote $(git rev-parse @{u})" && \
   echo "main   $(git rev-parse origin/main)" && \
   git status --short
   ```
   Expected: branch `official-feedback-content-impact-tab-content-v1`, local SHA = remote SHA = main SHA = `1babb01` (or later), working tree clean.

3. **Reply to Thomas with this greeting:**
   > Synced. On `official-feedback-content-impact-tab-content-v1` at `1babb01` (= main; zero commits ahead — no content work has started yet). FB-032 layout deletions merged via PR #74. Next FB ID is FB-033. **Ready when you are — paste Tina's Content Impact content feedback** (or just say "let's start on the synopsis card" / "let's start on the scatter" / "let's start on the slope" / etc. and I'll catalog the FB + write a plan). Reminders: FB-031 hardening pattern applies to any new AI-generated prose; Tina's deferred ISSUE on Snapshot KPIs delta wiring is a separate FB to schedule.

4. **Wait for Thomas before writing code.** Do NOT scaffold any new sections proactively. The content for the 3 ADDs comes from him.

## When Thomas's content arrives

1. **Cataloging:** one user message = one FB. Multi-part asks become FB-NNN-a/b/c.
2. **Read every line** of any existing component you'll modify (CLAUDE.md rule — never partial reads on the file under edit).
3. **Invoke `superpowers:writing-plans`** → write plan at `docs/superpowers/plans/2026-06-NN-content-impact-content-v1-iteration.md`. Source feedback verbatim + literal-interpretation policy + file structure + per-FB tasks with complete code blocks + self-review + final verification task.
4. **Confirm plan with Thomas.** `go`/`1` → `superpowers:subagent-driven-development`. `2` → `superpowers:executing-plans`.
5. **Per-FB loop:** dispatch implementer with full task text pasted in; spec compliance review; code quality review; focused fix subagent on any "Important" finding; QA surgical sweep with receipts (tsc, tests, grep, file:line, SHAs); mark complete; next FB.
6. **After all FBs:** update `status.md` + `feedback-log.md` + `changelog.md`, push, open PR with title "Content Impact content v1: …(FB-033..FB-NNN)".

## Working rules — non-negotiable

1. **Literal interpretation only.** Tina's words drive implementation. No silent reinterpretation.
2. **Glean Chat API for all LLM inference.** `gleanChat()` in `lib/glean.ts`. Token is USER. Do NOT pass `actAs`.
3. **FB-031 hardening pattern is MANDATORY for all new Glean-backed prose.** Section labels `(USE THESE EXACT VALUES)` + `Data integrity (strict)` prompt rule + post-Glean `validateXxxGrounding(output, context)` validator scanning numeric claims + retry-on-violation (max 2) + throw-to-empty-state on failure + cache version bump on prompt change. Canonical reference: `lib/peec/pr-influence-synopsis.ts`. Plus a unit test file where the FIRST assertion reproduces a plausible production bug (use the Vercel-preview pattern from `pr-influence-synopsis.test.ts` as the model).
4. **No em-dashes in any copy you write.** Periods or commas.
5. **Universal across clients** for design/UX. Sandbox-gate to Avenue Z only for hardcoded content. Lift the gate when wiring live data.
6. **Truth-grounded data only.** `--` with honest tooltip if uncomputable; never invent.
7. **Rule #11 (Recommended layout = full spec).** Anything not in Tina's layout doc gets removed by default unless she explicitly carved it out.
8. **Rule #13 — Literal text over interpretive text.** When Tina writes a title/subtitle, ship it verbatim.
9. **Paul rule:** No Neon migrations without explicit Paul approval.
10. **One user message = one FB.** Multi-part asks become FB-NNN-a/b/c.
11. **Every FB:** decision log + changelog + commit + SHA backfill + status.md update.
12. **QA surgical sweep after every FB.** Show receipts (tsc output, grep results, file:line refs, commit SHAs).
13. **Never skip hooks. Never force-push.**
14. **Cross-tab pre-empts.** When a bug Tina flagged on tab X has the same pattern on tab Y you haven't worked on yet, fix it proactively BEFORE Tina sees Y. Memory-backed for handoff durability.
15. **Branch naming:** layout/deletion rounds → `-tab-format-v1`. Content/ADDs rounds → `-tab-content-v1`. When iterating: `-format-v2`, `-content-v2`, etc.

## Tooling reminders

- `npx tsc --noEmit` for type checks (zero output = clean).
- `npx tsx <test-file>.test.ts` for tests (repo uses `node:assert` + `tsx`, NOT vitest).
- CSV writes via Python `csv` module (curly quotes + embedded newlines).
- `git rm` for deletions.
- Drizzle: `npx drizzle-kit generate` to author. DO NOT `migrate` against Neon without Paul approval.
- Vercel preview is the truth: spot-check + hard-refresh (`Cmd+Shift+R`).
- GitHub Branches API rename auto-closes attached PRs (we hit this on the tab-v1 → tab-format-v1 rename — had to reopen as PR #74). If you ever need to rename a branch with an open PR again, expect the same and plan for a new PR.

## Reusable assets shipped (canonical patterns to copy)

- `lib/peec/pr-influence-synopsis.ts` — FB-031 hardened Glean prose pattern (validator + retry + cache version).
- `lib/peec/sentiment-insights.ts` — Glean-backed live classifier over `UrlCitation[]`.
- `lib/peec/winners-losers.ts` — per-period per-model compute reactive to filter changes.
- `lib/peec/url-citations.ts` — per-URL citation rows with `mentionsYourBrand`, `competitorBrandNames`, `engines[]`, date-scopable.
- `lib/ga4/content-derive.ts` — `tallyTrajectories`, `computeUrlTiming`, `median`, `daysBetween`, `postPublishTrend` — still alive even though Content Impact §E was deleted (tests are the live consumer).

## Parked

- Content Impact (content v1) — IN FLIGHT on this branch.
- Technical Performance (not started — next tab after Content Impact closes).
- Profound parity on Winners/Losers (FB-023 open follow-up).
- Overview synopsis FB-031 hardening retrofit (apply pattern if Tina flags).
- `official-feedback-content-impact-tab-format-v1` branch leftover on remote post-merge (auto-delete-branch-on-merge not enabled). Harmless. Delete on request.

## Thomas's posture

Correctness above all else. QA sweeps. Receipts. No deviation. No reinterpretation of Tina's words. Cares deeply about:
- Cross-tab pre-empts so Tina doesn't see the same bug twice.
- The FB-031 hardening pattern applied to every new Glean-backed surface.
- Plan-first via `superpowers:writing-plans` before any code.
- Subagent-driven dispatch via `superpowers:subagent-driven-development` for execution.

Standing by. Awaiting Thomas's Content Impact content feedback to begin FB-033.
