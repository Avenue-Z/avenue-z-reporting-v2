# Handoff Prompt — Post-Compaction Resume

Copy everything below the `---` line into the new chat after compaction. It is self-contained and gives the new session everything it needs to continue without re-onboarding.

---

You are picking up an in-flight session on the `official-feedback` branch of `avenue-z-reporting-v2`. The prior chat was compacted. Read these files **in order** before responding to me:

1. `CLAUDE.md` (project conventions)
2. `docs/official-feedback/status.md` (state of this branch — read this first, it's the snapshot)
3. `docs/official-feedback/feedback-log.md` (per-item decision logs for FB-001, FB-002, FB-003)
4. `docs/official-feedback/changelog.md` (SHA lookup)
5. The MEMORY index file in `~/.claude/projects/-Users-thomaschangavenuez-Desktop-ave-z-reporting-official-feedback/memory/MEMORY.md` (persisted user rules — especially the Glean-only LLM rule)

**The mission:** Process Tina's feedback on the Answer Engine Optimization section of the platform. Tina sends asks via Google Doc screenshots and free-form text. I (Thomas) relay them in chat. Your job is to execute her asks surgically and document every decision in `docs/official-feedback/feedback-log.md`.

**Working rules — non-negotiable, established in the prior session:**

1. **One user message from me = one FB group.** Multiple changes in one message become sub-items (`FB-NNN-a`, `b`, `c`). All sub-items in a group ship as ONE combined commit.
2. **Make decisions, do not pepper me with questions.** I often cannot get clarification from Tina mid-session. When ambiguous, pick the most defensible interpretation, document why in the decision log, and ship.
3. **Truth-grounded data only.** No proxies, no derivations that ship wrong numbers. If a metric is genuinely not computable, the card shows `--` with an honest tooltip. Never invent a value.
4. **No em-dashes in copy I write.** Use periods or commas. This is a hard rule.
5. **Glean Chat API for ALL LLM inference.** No Vertex/Gemini, OpenAI, Anthropic direct, etc. The canonical helper is `gleanChat()` in `lib/glean.ts`. Reference Python pattern at `/Users/thomaschangavenuez/Desktop/avenuez-agents/pr-newsjacking/agents.py`. Required env: `GLEAN_INSTANCE=avenuez`, `GLEAN_API_TOKEN`, `GLEAN_ACT_AS=thomas.chang@avenuez.com`.
6. **Universal across clients by construction.** Edit shared components/data layers. Never per-client conditionals. New clients inherit automatically.
7. **Every FB item gets a full decision log** in `feedback-log.md`: verbatim ask, what was unambiguous, what was inferred (with why), what was out of scope, files touched, scope of impact, verification, open risks. This is so I (or Paul) can pick it up cold without context.
8. **Show receipts.** Every "done" claim has a file:line ref, a commit SHA, or a verification command output. Don't claim work without proving it.
9. **AEO section only.** Scope is `components/report-sections/peec-ai/` and its data layer (`lib/peec/*`, `lib/profound/*`). If feedback ever crosses into another section, flag it before touching.
10. **Tina is direct. Treat her words as authoritative intent, not suggestion.** Do not soften, "improve on," or reinterpret her asks. If you think she's wrong, say so explicitly to me — never override silently.

**What is already done on this branch:**

- **FB-001** (commit `7097a19`): Consistent header treatment across all 4 AEO tabs via shared `<SectionHeader>` component.
- **FB-002** (commit `ae8fc06`): AEO Overview tab redesign batch — 5 sub-items: removed "What changed" pills (002a), swapped 3 KPI cards to Visibility / Citation Share / AI Referral Traffic with truth-grounded Citation Share math for both Peec and Profound (002b), added executive AI synopsis card at top (002c), added Snapshot KPIs eyebrow (002d), reordered trend chart below KPI grid (002e).
- **FB-003** (commit `e33ed66`): Migrated FB-002c synopsis from Vertex Gemini to Glean Chat API per the Glean-only rule. Added `gleanChat()` helper to `lib/glean.ts`.

**Branch sync state at handoff:** local HEAD = remote `official-feedback` HEAD = `5095e4a`. Working tree clean. A PR may or may not be open against `main` — check with `gh pr list --head official-feedback`.

**Your first move in the new session:**

1. Read the files listed above in order.
2. Confirm to me you've read them by quoting one specific decision from each of FB-001, FB-002, and FB-003 (proves you actually read, not just claimed to).
3. Verify branch sync: `git rev-parse HEAD && git ls-remote origin official-feedback && git status --short`. Report any drift.
4. Then say: "Ready for the next batch. Paste Tina's feedback when you have it."

Do not start any new code work until I confirm what the next batch is. If I paste new feedback, it becomes the next FB-NNN. Follow the same workflow as the prior items.
