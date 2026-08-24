#!/usr/bin/env bash
# Guard: a schema change must never reach a branch whose database has not been
# migrated to match it.
#
# Drizzle's query builder enumerates columns explicitly, it never does `select *`.
# So the moment a new column lands in `lib/db/schema.ts`, EVERY read of that table
# selects it — including `getClientBySlug` / `getClientByEmail`, which back the
# Auth.js session callback and every /dashboard and /portal page. Against a
# database that does not have the column yet, that is Postgres 42703, and it
# throws rather than degrades: merging code ahead of its migration takes the whole
# app down, not just the feature that needed the column.
#
# This gate does not try to detect whether the migration ran. CI cannot reach the
# target database, and a migrator's exit code is not evidence anyway: drizzle-kit's
# migrator only applies migrations stamped later than the newest row already in
# `drizzle.__drizzle_migrations`, so a migration that is out of timestamp order
# with what is recorded is skipped and the command still exits 0. It therefore
# gates on a human confirming it with a label, the same shape as the self-reviewed
# gate. The procedure behind each label is in docs/runbooks/applying-migrations.md.
#
# Ordering is NOT the same for every migration, which is why there are two labels:
#
#   additive (ADD COLUMN, CREATE TABLE, …)
#     Apply the migration FIRST, then merge. New code needs the column to exist.
#     -> 'migration-applied'
#
#   destructive (DROP COLUMN, DROP TABLE, RENAME …)
#     Merge and DEPLOY first, then apply. Dropping a column out from under running
#     code that still selects it is the same 42703 outage in the other direction.
#     -> 'migration-deferred-apply'
#
# Inputs (env):
#   BASE_SHA      the PR's base commit  (github.event.pull_request.base.sha)
#   HEAD_SHA      the PR's head commit  (github.event.pull_request.head.sha)
#   LABEL_EVENTS  JSON array of this PR's `labeled` and `unlabeled` timeline
#                 events, as [{"label": "…", "at": "<ISO8601>", "event": "…"}, …].
#                 `event` defaults to "labeled" when absent. Defaults to [].
#
# Exercised by .github/scripts/guard-migration-ordering.test.sh.

set -euo pipefail

readonly ADDITIVE_LABEL='migration-applied'
readonly DESTRUCTIVE_LABEL='migration-deferred-apply'
readonly RUNBOOK='docs/runbooks/applying-migrations.md'
readonly VERIFY_QUERY="select column_name from information_schema.columns where table_name = '<table>' and column_name = '<column>';"

: "${BASE_SHA:?BASE_SHA is required}"
: "${HEAD_SHA:?HEAD_SHA is required}"
LABEL_EVENTS="${LABEL_EVENTS:-[]}"

# Compare against the merge base, not the base tip: base.sha moves as other PRs
# land, which would otherwise pull unrelated files into the diff.
if ! MERGE_BASE="$(git merge-base "$BASE_SHA" "$HEAD_SHA" 2>&1)"; then
  echo "::error::Migration guard could not compute the merge base of base ${BASE_SHA} and head ${HEAD_SHA}, so it cannot tell what this PR changes, and is failing closed rather than guessing. This is NOT a missing label. The usual cause is a force-push to the shared base branch (dev and staging are both shared), which leaves the recorded base commit unreachable. Remedy: merge the current base branch into this PR and push — that re-anchors it — then re-run. git said: ${MERGE_BASE:-<no output; the two commits have no common ancestor>}"
  exit 1
fi

CHANGED="$(git diff --name-only --diff-filter=ACMR "$MERGE_BASE" "$HEAD_SHA")"
MIGRATIONS="$(printf '%s\n' "$CHANGED" | grep -E '^drizzle/[^/]+\.sql$' || true)"
SCHEMA_CHANGED="$(printf '%s\n' "$CHANGED" | grep -Fx 'lib/db/schema.ts' || true)"

# Classify each of this PR's migrations. Destructive = removes or renames
# something the running code may still be selecting. Additive = introduces
# something new code may immediately select. A file can be both.
#
# Matching runs over a normalized copy of the SQL: lowercased so no pattern needs
# a case flag (BSD sed has no portable `I`), and with newlines collapsed so a
# statement wrapped across lines still matches — grep is line-oriented, and a
# hand-written `ALTER TABLE users\n  DROP COLUMN demo_mode;` would otherwise read
# as additive and pass unlabelled.
#
# `COLUMN` is optional in Postgres (`ALTER TABLE users DROP demo_mode;` is valid,
# as is `RENAME old TO new`), so the DROP match cannot require it. That makes the
# match broad, which is why the three harmless forms — DROP CONSTRAINT, DROP
# DEFAULT, DROP NOT NULL, none of which break a `select` — are stripped out
# first rather than excluded in the pattern. Each is stripped as its own clause,
# not to the end of the statement, so a compound
# `ALTER TABLE t DROP CONSTRAINT c, DROP COLUMN d;` keeps its real drop.
readonly DESTRUCTIVE_RE='(^|[^[:alnum:]_])(drop|rename)[[:space:]]+["a-z_]'
readonly ADDITIVE_RE='(^|[^[:alnum:]_])(add[[:space:]]+(column|constraint)|create[[:space:]]+(table|type|schema|sequence|index|view|unique))'

normalize_sql() { # reads SQL on stdin, emits one lowercased statement per line
  tr '[:upper:]' '[:lower:]' \
    | tr '\n' ' ' \
    | tr -s '[:space:]' ' ' \
    | sed 's/;/;\
/g'
}

strip_harmless_drops() { # the DROP forms that break no `select`
  sed -E -e 's/drop[[:space:]]+constraint[[:space:]]+[^ ,;]+//g' \
         -e 's/drop[[:space:]]+default//g' \
         -e 's/drop[[:space:]]+not[[:space:]]+null//g'
}

DESTRUCTIVE=''
ADDITIVE=''
while IFS= read -r file; do
  [ -n "$file" ] || continue
  sql="$(git show "${HEAD_SHA}:${file}" | normalize_sql)"
  if printf '%s\n' "$sql" | strip_harmless_drops | grep -Eq "$DESTRUCTIVE_RE"; then
    DESTRUCTIVE="${DESTRUCTIVE}${file}"$'\n'
  fi
  if grep -Eq "$ADDITIVE_RE" <<<"$sql"; then
    ADDITIVE="${ADDITIVE}${file}"$'\n'
  fi
done <<<"$MIGRATIONS"

HEAD_COMMITTED_AT="$(git show -s --format=%ct "$HEAD_SHA")"

# Newest application time of $1 that has not since been revoked, as a unix
# timestamp; empty if never applied or removed after its last application.
# GitHub keeps a `labeled` event forever, so taking the label back off would
# otherwise leave the attestation standing — the label is only current when its
# newest `labeled` is strictly newer than its newest `unlabeled`.
label_applied_at() {
  jq -r --arg l "$1" '
    [.[] | select(.label == $l)] as $events
    | ([$events[] | select(.event == "unlabeled") | .at | fromdateiso8601] | max // 0) as $revoked
    | [ $events[]
        | select((.event // "labeled") == "labeled")
        | .at | fromdateiso8601
        | select(. > $revoked) ]
      | max // ""
  ' <<<"$LABEL_EVENTS"
}

iso() { jq -rn --argjson t "$1" '$t | todateiso8601'; }

# Requires $1 to be present AND to have been applied after the head commit was
# committed. GitHub never strips a label on push, so without the second half a PR
# labelled for migration 0019 stays green after 0020 is pushed on top of it, and
# 0020 merges having been confirmed by nobody. Committer date is the closest
# stand-in for push time that the API offers; git sets it to now on commit,
# amend, rebase and cherry-pick, so the only way past this is to forge
# GIT_COMMITTER_DATE deliberately.
require_label() {
  local label="$1" guidance="$2" at
  at="$(label_applied_at "$label")"

  if [ -z "$at" ]; then
    echo "::error::${guidance} Then add the '${label}' label to this PR. Verify with: ${VERIFY_QUERY} Full procedure: ${RUNBOOK}."
    exit 1
  fi

  if [ "$at" -lt "$HEAD_COMMITTED_AT" ]; then
    echo "::error::The '${label}' label was applied at $(iso "$at"), BEFORE the current head commit ${HEAD_SHA:0:7} ($(iso "$HEAD_COMMITTED_AT")) — so it confirms a migration set that is no longer what this PR ships. GitHub does not clear labels on push, which makes a stale label silent. Remove the label, redo the step for the migrations at this commit, then re-apply it. ${guidance} Full procedure: ${RUNBOOK}."
    exit 1
  fi

  echo "OK — '${label}' was applied at $(iso "$at"), after the head commit ($(iso "$HEAD_COMMITTED_AT"))."
}

if [ -z "$MIGRATIONS" ] && [ -z "$SCHEMA_CHANGED" ]; then
  echo "OK — this PR touches neither lib/db/schema.ts nor drizzle/*.sql."
  exit 0
fi

echo "Migration-relevant files in this PR:"
printf '%s\n%s\n' "$MIGRATIONS" "$SCHEMA_CHANGED" | grep -v '^$' | sed 's/^/  /'

# A PR that ships both an addition and a removal, with lib/db/schema.ts changed
# so this PR's code reads the addition, has two mutually exclusive orderings and
# no honest label. The addition must be applied BEFORE the merge deploys (or the
# new column is selected against a database without it); the removal must be
# applied AFTER (or the dropped column is pulled from under code still selecting
# it). Classifying it destructive and taking migration-deferred-apply — which is
# what happens without this check — hands out "deploy first, apply after"
# guidance that is right for the drop and is the exact 42703 for the add. One
# `db:generate` over a schema edit that adds one column and drops another emits
# exactly this file, so it is reachable from ordinary use, and there is no label
# to add: the work has to be split. Without a lib/db/schema.ts change no code in
# this PR selects the addition, so there is no conflict and the destructive
# ordering below governs both.
if [ -n "$DESTRUCTIVE" ] && [ -n "$ADDITIVE" ] && [ -n "$SCHEMA_CHANGED" ]; then
  echo "Additive:"
  printf '%s' "$ADDITIVE" | grep -v '^$' | sed 's/^/  /'
  echo "Destructive:"
  printf '%s' "$DESTRUCTIVE" | grep -v '^$' | sed 's/^/  /'
  echo "::error::This PR ships BOTH an additive and a destructive migration alongside a lib/db/schema.ts change, and those two need opposite orderings: the addition must be applied BEFORE this merges (new code selects it immediately), the removal only AFTER the deploy is live (running code still selects it). No single label can confirm both, so neither label is offered here — split this into expand/contract. Land the additive migration and the code that reads it in one PR ('${ADDITIVE_LABEL}'), then the removal in a follow-up once nothing deployed reads the dropped object ('${DESTRUCTIVE_LABEL}'). Full procedure: ${RUNBOOK}."
  exit 1
fi

if [ -n "$DESTRUCTIVE" ]; then
  echo "Destructive (removes or renames something running code may still select):"
  printf '%s' "$DESTRUCTIVE" | grep -v '^$' | sed 's/^/  /'
  require_label "$DESTRUCTIVE_LABEL" \
    "This PR ships a DESTRUCTIVE migration, so the ordering is the reverse of the usual one: do NOT apply it before merging. Confirm no deployed code still reads the dropped or renamed object, merge, and let the deploy go live FIRST; the migration is applied only afterwards. If deployed code does still read it, split this into expand/contract — land the code change on its own, then the migration in a follow-up PR."
  exit 0
fi

if [ -z "$SCHEMA_CHANGED" ]; then
  echo "OK — additive migration with no lib/db/schema.ts change, so no code in this PR can read it yet."
  exit 0
fi

if [ -z "$MIGRATIONS" ]; then
  require_label "$ADDITIVE_LABEL" \
    "This PR changes lib/db/schema.ts but ships NO migration in drizzle/. Either 'npm run db:generate' was never run, or the migration landed in an earlier PR — and neither is safe to assume, because Drizzle selects every column in the file the moment this merges. Run the verification query against every target database (dev, staging, production) and confirm each column in the diff actually exists; if any does not, generate and apply the migration."
  exit 0
fi

require_label "$ADDITIVE_LABEL" \
  "This PR adds a migration and the schema change that reads it. Apply the migration to the target environment BEFORE merging and confirm the column exists — the migrator exiting 0 is not confirmation, only the query is."
