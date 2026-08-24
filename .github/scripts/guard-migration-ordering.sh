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
#   LABEL_EVENTS  JSON array of this PR's `labeled` timeline events, as
#                 [{"label": "...", "at": "<ISO8601>"}, …]. Defaults to [].
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

# Which of this PR's migrations remove or rename something the running code may
# still be selecting. DROP CONSTRAINT / DROP DEFAULT / DROP NOT NULL are
# deliberately not matched: they do not break a `select`.
DESTRUCTIVE=''
while IFS= read -r file; do
  [ -n "$file" ] || continue
  sql="$(git show "${HEAD_SHA}:${file}")"
  if grep -Eiq 'drop[[:space:]]+(column|table|type|schema|sequence)|rename[[:space:]]+(column|to)' <<<"$sql"; then
    DESTRUCTIVE="${DESTRUCTIVE}${file}"$'\n'
  fi
done <<<"$MIGRATIONS"

HEAD_COMMITTED_AT="$(git show -s --format=%ct "$HEAD_SHA")"

# Newest application time of $1, as a unix timestamp; empty if never applied.
label_applied_at() {
  jq -r --arg l "$1" '[.[] | select(.label == $l) | .at | fromdateiso8601] | max // ""' <<<"$LABEL_EVENTS"
}

iso() { jq -rn --argjson t "$1" '$t | todateiso8601'; }

# Requires $1 to be present AND to have been applied after the head commit was
# authored. GitHub never strips a label on push, so without the second half a PR
# labelled for migration 0019 stays green after 0020 is pushed on top of it, and
# 0020 merges having been confirmed by nobody.
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
