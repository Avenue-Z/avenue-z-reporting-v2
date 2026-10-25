# Code Review Record — `ci/migration-ordering-guard` (PR #211)

**Feature under review:** PR #211 — a CI gate that stops a schema change from reaching a branch whose database has not been migrated to match it, targeting `dev`.
**Diff range reviewed:** `749b891..65c7c9e` (merge base with `dev` through branch head), 5 files, +650/−4. No unrelated code is in scope.
**Reviewers:** Thomas (round 1, against `5ee71aa` — a two-reviewer pass, one tracing logic/regex/security/docs, one executing the guard against throwaway repos). Paul (round 2, disposition of the three findings).
**Authorship note:** commits `3504bc5` and `65c7c9e` — the fixes for all findings below — were written by Claude at Paul's direction, *after* Thomas's review. They have not been independently reviewed by a second person. That is the one open item on this record; see §5.
**This document changes no code.**

Files in scope:

| File | Change |
|---|---|
| `.github/workflows/guard-migration-ordering.yml` | new — PR trigger, label-timeline collection |
| `.github/scripts/guard-migration-ordering.sh` | new — classification and the label requirement |
| `.github/scripts/guard-migration-ordering.test.sh` | new — 28 cases against real throwaway git repos |
| `.github/workflows/checks.yml` | adds the `migration-guard` job that runs the suite |
| `docs/runbooks/applying-migrations.md` | new — the procedure each label attests to |
| `MIGRATIONS-PENDING.md` | points at the runbook |

No migration is generated or applied by this PR, and it touches no application code.

---

## §1 How it works

### 1.1 The outage it exists to prevent

Drizzle's query builder enumerates columns explicitly — it never emits `select *`. So the moment a column lands in `lib/db/schema.ts`, **every** read of that table selects it, including `getClientBySlug` and `getClientByEmail` (`lib/db/queries.ts`), which back the Auth.js session callback and every `/dashboard` and `/portal` page. Against a database that does not have the column yet that is Postgres `42703`, and it throws rather than degrades. Merging code ahead of its migration does not break one feature; nobody can log in and no report renders.

The same failure arrives from the other direction when a column is dropped out from under deployed code that still selects it.

### 1.2 Why it gates on a human, not on a migrator

CI cannot reach the target databases, so it cannot check whether a migration ran. A migrator's exit code is not evidence either: `drizzle-kit migrate` reads only the single newest row of `drizzle.__drizzle_migrations` (`order by created_at desc limit 1`) and applies a migration only when that row's `created_at` is older than the migration's `folderMillis`. It never compares hashes. A migration out of timestamp order with what is recorded is skipped silently, and the command still exits 0.

So the gate attests to a **query**, not to a green command. The runbook has the operator run

```sql
select column_name from information_schema.columns
where table_name = '<table>' and column_name = '<column>';
```

against every target database and label the PR only once it returns a row. The label is the human's signature on that query.

### 1.3 The two labels, and why there are two

Ordering is not the same for every migration:

| Migration | Order | Label |
|---|---|---|
| **Additive** — `ADD COLUMN`, `CREATE TABLE` | Apply **first**, then merge | `migration-applied` |
| **Destructive** — `DROP COLUMN`, `DROP TABLE`, `RENAME …` | Merge and **deploy first**, apply after | `migration-deferred-apply` |

### 1.4 How a file is classified

`guard-migration-ordering.sh` diffs the PR against `git merge-base` of base and head — the merge base, not the base tip, so that migrations landing on `dev` from other PRs are not attributed to this one. Each `drizzle/*.sql` in that diff is read at the head SHA and normalized before matching: lowercased, and newlines collapsed so one statement occupies one line. Both steps are load-bearing. Lowercasing removes any need for a case-insensitivity flag, which BSD `sed` does not portably support and the suite runs on macOS as well as the runner. Flattening defeats a `DROP` wrapped across lines, which a line-oriented `grep` would otherwise read as additive.

Because `COLUMN` is optional in Postgres — `ALTER TABLE users DROP demo_mode;` and `RENAME old TO new` are both valid — the destructive match cannot require the keyword, which makes it necessarily broad. The three harmless forms are therefore **removed from the text first** rather than excluded in the pattern:

- `DROP CONSTRAINT <name>`, `DROP DEFAULT`, `DROP NOT NULL` — none break a `select`.

Each is stripped as its own clause and not to the end of the statement, so `ALTER TABLE t DROP CONSTRAINT c, DROP COLUMN d;` keeps its real drop. What survives is matched with `(^|[^[:alnum:]_])(drop|rename)[[:space:]]+["a-z_]`. The leading class is a hand-rolled word boundary — without it, a table named `backdrop` would match.

The additive pattern is deliberately narrower: `ADD COLUMN`, `CREATE TABLE`, `CREATE TYPE`. It exists only to detect the mixed conflict in §1.6, and that conflict needs something this PR's code will *select* on merge. An index or a constraint is a new object no `select` depends on.

### 1.5 Why the label must be newer than the head commit

GitHub does not strip labels on push. Without a freshness check, a PR labelled for migration 0019 stays green after 0020 is pushed on top of it, and 0020 merges confirmed by nobody. `require_label` therefore demands the label's application time be strictly greater than the head commit's **committer** date — the closest stand-in for push time the API offers, since git resets it on commit, amend, rebase and cherry-pick. Skew only ever fails closed. The documented way past it is to forge `GIT_COMMITTER_DATE` deliberately; that is accepted, and stated in the script header.

A label is also only current when its newest `labeled` event is strictly newer than its newest `unlabeled` event, so removing a label genuinely withdraws the attestation (finding 1).

### 1.6 The case with no honest label

A PR that ships **both** an addition and a removal, alongside a `lib/db/schema.ts` change, has two mutually exclusive orderings: the addition must be applied before the merge deploys, the removal only after. No single label can confirm both. The guard hard-fails it with neither label offered and points at expand/contract. This is checked PR-wide, so it catches the conflict split across two migration files as well as within one.

Without a `lib/db/schema.ts` change there is no conflict — no code in the PR selects the addition — and the destructive ordering governs both halves.

### 1.7 Enforcement status

**Advisory everywhere as of this PR.** A red run reports and blocks no merge button. `dev` has no ruleset at all, and creating one was scoped out — which matters, because `dev` is the branch the outage reaches first. `staging` and `main` can add `require-migration-applied` to their promotion-gate rulesets, but only once this workflow exists on the head branch of the PRs those gates see, or every promotion blocks on a status that can never arrive. The workflow header states this; §5 tracks it.

---

## §2 Verification method

1. **Thomas's round-1 pass was empirical, not just read** — the bundled suite plus roughly 24 adversarial scenarios against real throwaway repos, by a second reviewer working independently of the one tracing the code. Finding 1 was reproduced, not inferred. Those results are taken as reported here; they were not re-run for this record.
2. **The suite was watched go from 15 to 28 cases with the original 15 unchanged**, so the fixes are additive to previously-proven behavior rather than a rewrite that happens to pass.
3. **The broadened destructive match was run over every real migration in the repo** — all 21 files in `drizzle/` — to check the loosened pattern against production input rather than fixtures. Every one still classifies additive-only; the loosening introduced no false positive on real Drizzle output.
4. **Findings 4 and 5 were found while writing this record**, not by the round-1 pass, and both were fixed in `65c7c9e`.
5. **One check in this review was initially run against the wrong worktree** and re-run correctly before being recorded (finding 4). Noted because a record that hides a mis-step is not a record of what happened.
6. **Finding 6 is explicitly not verified.** It depends on the shape of a GitHub API response that cannot be exercised without a live PR, and is recorded as PLAUSIBLE rather than asserted.

Gates at `65c7c9e`: guard suite 28/28 · `bash -n` clean on both scripts. At `3504bc5`, CI on the runner: `test`, `rsc-boundary`, `require-migration-applied`, Vercel all green.

**The guard's own `require-migration-applied` check passing on this PR is not evidence the guard works.** This PR touches no `drizzle/*.sql` and no `lib/db/schema.ts`, so the check takes its "touches neither" exit. The evidence is the 28-case suite, which now runs in CI as of `65c7c9e`.

---

## §3 Findings

Sev: **●** correctness · **○** cleanup/convention. Status: CONFIRMED (proven in-tree) / PLAUSIBLE (code assumption confirmed, external trigger unverified).

Findings 1–3 cite where the bug was, at `5ee71aa`. Findings 4–8 cite where the code lives now, at `65c7c9e`.

| # | Sev | Status | Location | Finding | Resolution |
|---|---|---|---|---|---|
| 1 | ● | CONFIRMED | `guard-migration-ordering.yml:50` | Only `labeled` timeline events collected; GitHub keeps them forever, so removing a label to revoke the attestation left the guard green until the next push | Fixed in `3504bc5` — `unlabeled` collected, newest-labeled-beats-newest-unlabeled |
| 2 | ● | CONFIRMED | `guard-migration-ordering.sh:69` | Destructive match required the `COLUMN` keyword (optional in Postgres) and was line-oriented, so `DROP demo_mode;`, `RENAME old TO new` and any DROP split across lines classified additive and passed unlabelled | Fixed in `3504bc5` — normalize, strip harmless forms, match broadly |
| 3 | ● | CONFIRMED | `guard-migration-ordering.sh:115` | A migration that both adds and drops was classified destructive and satisfied by `migration-deferred-apply`, whose deploy-first guidance is the exact 42703 for the added column | Fixed in `3504bc5` — hard-fails, no label offered |
| 4 | ● | CONFIRMED | `.github/workflows/` | The guard's own suite ran in no workflow at all — the only evidence it behaves correctly executed solely by hand | Fixed in `65c7c9e` — `migration-guard` job in `checks.yml` |
| 5 | ● | CONFIRMED | `guard-migration-ordering.sh` (additive pattern) | The new mixed check counted `CREATE INDEX` / `ADD CONSTRAINT` / `CREATE VIEW` as additions, hard-failing a drop-plus-reindex migration that needs no split | Fixed in `65c7c9e` — narrowed to `ADD COLUMN` / `CREATE TABLE` / `CREATE TYPE` |
| 6 | ○ | PLAUSIBLE | `guard-migration-ordering.yml:50` | The `unlabeled` event is assumed to carry `.label.name`, matching `labeled`. If it does not, the jq yields null and revocation silently never matches — finding 1's behavior returns, quietly | Open — needs one live PR to confirm. See §5 |
| 7 | ○ | CONFIRMED | `guard-migration-ordering.yml:9-20` | Advisory everywhere; `dev` has no ruleset, and `dev` is the branch the outage reaches first | Open, deliberate and documented in the workflow header |
| 8 | ○ | CONFIRMED | `guard-migration-ordering.sh` (destructive pattern) | The match is deliberately broad, so a SQL comment containing `drop <word>` classifies destructive | Accepted — fails closed, and no false positive on any of the 21 real migrations |

---

## §4 Detail on the load-bearing findings

**Finding 1 — the revocation hole.** This is the one that mattered most for enforcement, and it is subtle because the workflow *looks* correct: it triggers on `unlabeled`, so the intent is plainly that removal re-evaluates. It did re-evaluate — and read the stale `labeled` event, and stayed green. A gate you cannot revoke is worse than one you never applied, because the label reads as a live attestation. The fix reads both event types and treats a label as current only when its newest `labeled` is strictly newer than its newest `unlabeled`. Same-second ties resolve to revoked. Events lacking an `event` field default to `labeled`, which kept all 15 original cases passing untouched.

**Finding 2 — why the fix is not one regex.** The obvious repair, making `COLUMN` optional, is wrong on its own: the deliberate `DROP CONSTRAINT` / `DROP DEFAULT` / `DROP NOT NULL` exclusions only work *because* the keyword is mandatory. Allow a bare `DROP <ident>` and all three come back as false positives. Lookahead would express it, but `grep -P` is unavailable to the suite, which runs on macOS as well as the runner. Hence strip-then-match: remove the three harmless clauses from the text, then match what remains broadly. Stripping per-clause rather than to the `;` is the detail that keeps `DROP CONSTRAINT c, DROP COLUMN d` correct, and there is a case pinning it.

**Finding 3 — why no label is honest.** One `npm run db:generate` over a schema edit that adds one column and drops another emits exactly one `.sql` containing both. That makes this reachable from ordinary use, not a hand-written edge case — worth stating plainly, because the round-1 summary characterized all three findings as unreachable through Drizzle-generated SQL plus a normal push, and this one is not. The two orderings are mutually exclusive, so the guard offers no label and demands an expand/contract split. The cost of that choice is real and should be named: there is **no override**. If this becomes a required check, a legitimately mixed migration cannot merge until it is split. That is the intended trade, made deliberately.

**Finding 6 — the unverified assumption.** The fix for finding 1 reads `.label.name` off `unlabeled` events. GitHub's timeline documents a `label` object on both event types, and the jq is written the same way for both, so the code assumption is consistent — but no live `unlabeled` event has been observed through this workflow. If the field is absent or named differently, `label_applied_at` compares against a revocation time that never matches, and the guard silently reverts to finding 1's behavior. Silently is the problem: nothing goes red. Confirming it costs one PR — label it, remove the label, watch the run go from green to red.

---

## §5 Follow-ups

Repo issues are disabled, so these are recorded here and carried into `CLAUDE.md` if they outlive this PR.

*Blocks calling this gate enforced (not the merge to `dev`)*
- **Confirm finding 6 on a live PR** before `require-migration-applied` is added to any ruleset. Until it is confirmed, revocation is assumed, not known, and it is the failure mode that goes green rather than red. **Highest-value item on this list.**
- **Wire the check into the `staging` and `main` promotion-gate rulesets** — and only after this workflow exists on the head branch each gate sees (`dev` for staging, `staging` for main). Added earlier, every promotion PR blocks on a status that cannot arrive.
- **`dev` has no ruleset**, so the branch the outage reaches first is the one branch that cannot enforce this. Creating one is its own decision.

*Needs a second pair of eyes*
- **`3504bc5` and `65c7c9e` are authored-not-reviewed.** They are the fixes for every finding here, they rewrote the classification engine, and they were written after Thomas's pass. The round-1 verdict ("safe to approve and land") was given against `5ee71aa` and does not extend to them.

*Explicitly not follow-ups*
- **Forging `GIT_COMMITTER_DATE`** defeats the freshness check. Accepted, documented in the script header — the gate is an attestation, and someone determined to falsify an attestation can. Recorded so a future pass does not re-derive it.
- **The broad destructive match** (finding 8) is intentional. Its errors land on the side of demanding a label that was not needed, which fails closed and costs a conversation, not an outage.
