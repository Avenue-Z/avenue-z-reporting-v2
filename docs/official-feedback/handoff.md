# Handoff Prompt — Post-Compaction Resume (PR Influence tab batch)

Copy everything below the `---` line into the new Claude Code session. It is self-contained and gives the new session everything it needs to continue.

---

You are picking up an in-flight session on the `avenue-z-reporting-v2` repo (working directory: `/Users/thomaschangavenuez/Desktop/ave-z-reporting-official-feedback`). The prior chat was compacted after we finished the **AEO Overview tab** batch and shipped it as PR [#50](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/50) on the `official-feedback-overview-tab` branch.

This new session is for the **AEO PR Influence tab** batch on a brand-new branch.

## Read these files in order before responding to me

1. `CLAUDE.md` (project conventions)
2. `docs/official-feedback/status.md` (state of the previous Overview tab branch, FB log to date, branch rename history, per-tab workflow plan)
3. `docs/official-feedback/feedback-log.md` (per-item decision logs for FB-001 through FB-008 — the full Overview tab history)
4. `docs/official-feedback/changelog.md` (SHA lookup)
5. `~/.claude/projects/-Users-thomaschangavenuez-Desktop-ave-z-reporting-official-feedback/memory/MEMORY.md` (persisted user rules — especially the Glean-only LLM rule)

## The mission

Process Tina's feedback on the **PR Influence tab** of the AEO section. Same workflow as the Overview tab batch: Tina sends asks via Google Doc screenshots and free-form text. Thomas (the user) relays them. Your job is to execute her asks surgically and document every decision in `docs/official-feedback/feedback-log.md`.

## First moves — do these IMMEDIATELY before any other work

1. **Read all the files listed above in order.**
2. **Confirm to me you read them** by quoting one specific decision from each of FB-001, FB-005, and FB-008 (proves you actually read, not just claimed to).
3. **Verify Overview branch is still synced** with this command:
   ```
   git fetch origin && \
   git rev-parse origin/official-feedback-overview-tab && \
   gh pr view 50 --json state,headRefName,headRefOid
   ```
   Report any drift.
4. **Cut a new branch for PR Influence work**:
   ```
   git checkout main && \
   git pull origin main && \
   git checkout -b official-feedback-pr-influence-tab
   ```
   Then push the empty branch to origin and confirm:
   ```
   git push -u origin official-feedback-pr-influence-tab && \
   git status --short
   ```
5. Then say: **"Ready for the PR Influence tab batch. Paste Tina's feedback when you have it."**

## Working rules — non-negotiable

1. **One user message = one FB group.** Multiple changes in one message become sub-items (`FB-NNN-a`, `b`, `c`). All sub-items in a group ship as ONE combined commit. FB IDs continue sequentially across branches — next item is FB-009.
2. **Make decisions, do not pepper me with questions.** Thomas often cannot get clarification from Tina mid-session. When ambiguous, pick the most defensible interpretation, document why in the decision log, and ship. The one exception: when the choice would ship wrong data or genuinely different visual outcomes, present a tight A-or-B and ask.
3. **Truth-grounded data only.** No proxies, no derivations that ship wrong numbers. If a metric is not computable, the card shows `--` with an honest tooltip. Never invent a value.
4. **No em-dashes in copy I write.** Use periods or commas. Hard rule.
5. **Glean Chat API for ALL LLM inference.** No Vertex/Gemini, OpenAI, Anthropic direct. Canonical helper is `gleanChat()` in `lib/glean.ts`. Required env: `GLEAN_INSTANCE=avenuez`, `GLEAN_API_TOKEN`, `GLEAN_ACT_AS=thomas.chang@avenuez.com`.
6. **Universal across clients by construction.** Edit shared components/data layers. Never per-client conditionals. New clients inherit automatically.
7. **Every FB item gets a full decision log** in `feedback-log.md`: verbatim ask, what was unambiguous, what was inferred (with why), what was out of scope, files touched, scope of impact, verification, open risks. So Paul (or future-Thomas) can pick it up cold.
8. **Show receipts.** Every "done" claim has a file:line ref, a commit SHA, or a verification command output.
9. **PR Influence tab ONLY for this branch.** Scope is `components/report-sections/peec-ai/pr-influence.tsx` and its data layer (`lib/peec/url-citations.ts` and per-prompt fields from `lib/peec/client.ts`). If feedback crosses into Overview / Content Impact / Technical Performance, flag it and STOP — that goes on a different branch. The one exception: if a fix has to touch a shared file (`lib/peec/client.ts`, `lib/peec/models.ts`, `section-header.tsx`, etc.), that's fine, just call it out in the decision log.
10. **Tina is direct. Treat her words as authoritative intent, not suggestion.** Do not soften, "improve on," or reinterpret her asks. If you think she's wrong, say so explicitly to me — never override silently.

## What is already done across the prior branch (Overview tab — `official-feedback-overview-tab`)

All shipped to PR [#50](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/50). Not part of this branch's work but available for context / iteration if Tina circles back on any of them:

- **FB-001** (`7097a19`): Consistent SectionHeader across all 4 AEO tabs.
- **FB-002** (`ae8fc06`): Overview redesign — removed pills, swapped 3 KPIs to Visibility / Citation Share / AI Referral Traffic, added Exec Synopsis, Snapshot KPIs eyebrow, reordered trend chart.
- **FB-003** (`e33ed66`): Migrated synopsis from Vertex Gemini to Glean Chat API.
- **FB-004** (`da74c23`): Vertical axis on Visibility trend chart.
- **FB-005** (`6142968`): Fixed Gemini-being-mislabeled-as-Google data bug in Peec bucketing; display label `Google` → `Google AI Overview`.
- **FB-006** (`d9f8f70`): Biggest Winners + Biggest Losers cards (static content for now).
- **FB-007** (`2077037`): Removed brand-categories chart + definitions; stretched Leaderboard to full width.
- **FB-008** (`c19733e`): Recolored Domain Types chart + legend with the Avenue Z brand palette (no `#8A8A8A` gray left).

## Per-tab branch workflow

Going forward, each AEO tab gets its own branch + its own PR. The full plan:

| Tab | Branch | Status |
|---|---|---|
| Overview | `official-feedback-overview-tab` | PR [#50](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/50) open, awaiting review/merge |
| **PR Influence** | **`official-feedback-pr-influence-tab`** | **this session — cut new branch from main** |
| Content Impact | `official-feedback-content-impact-tab` | future session |
| Technical Performance | `official-feedback-technical-performance-tab` | future session |

Branch was renamed mid-flight (was `official-feedback`, became `official-feedback-overview-tab`) to make room for this structure. FB IDs do NOT reset per branch — they continue sequentially across the whole workstream. Next item Tina sends is **FB-009**.

## If Tina sends feedback that re-touches a prior FB item

Per Thomas's instruction: new feedback that iterates on an old item gets a NEW FB-NNN id (e.g. `FB-010 — iteration on FB-006`). Do NOT reopen old FB IDs. Keep the audit trail linear. Note the lineage in the decision log.

## Sync state at handoff

- Overview branch (prior work): `official-feedback-overview-tab` HEAD = `234e7a6`, remote in sync, PR [#50](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/50) OPEN against `main`.
- PR Influence branch (this work): not yet cut — your first action after reading the docs is to cut `official-feedback-pr-influence-tab` from `main`.

Do not start any code work until I confirm Tina's PR Influence feedback. After your reading + sync check + new-branch cut + greeting, wait for me to paste the next batch.
