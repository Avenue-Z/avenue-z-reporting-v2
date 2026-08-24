#!/usr/bin/env bash
# Exercises .github/scripts/guard-migration-ordering.sh against throwaway git
# repositories — real commits, real diffs, real merge bases. Run it directly:
#
#     bash .github/scripts/guard-migration-ordering.test.sh
#
# A gate is only worth having if its failure cases are known to fail, so every
# case below asserts the exit status AND a distinguishing piece of the output.

set -uo pipefail

GUARD="$(cd "$(dirname "$0")" && pwd)/guard-migration-ordering.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASSED=0
FAILED=0

# A repo with a base commit on `main` and a feature branch checked out.
new_repo() {
  local dir="$TMP/$1"
  mkdir -p "$dir/lib/db" "$dir/drizzle"
  git -C "$dir" init -q -b main
  git -C "$dir" config user.email guard@test
  git -C "$dir" config user.name guard
  printf 'export const clients = pgTable("clients", { id: uuid("id") })\n' >"$dir/lib/db/schema.ts"
  printf 'ALTER TABLE "clients" ADD COLUMN "existing" text;\n' >"$dir/drizzle/0001_base.sql"
  git -C "$dir" add -A
  git -C "$dir" commit -qm base
  git -C "$dir" checkout -q -b feature
  printf '%s' "$dir"
}

commit() { # dir message [committer_date]
  local dir="$1" msg="$2" when="${3:-}"
  git -C "$dir" add -A
  if [ -n "$when" ]; then
    GIT_COMMITTER_DATE="$when" GIT_AUTHOR_DATE="$when" git -C "$dir" commit -qm "$msg"
  else
    git -C "$dir" commit -qm "$msg"
  fi
}

# Label events JSON placing the label $2 seconds after the head commit
# (negative = before it, i.e. a stale label).
labels_at() { # dir label offset_seconds
  local ct
  ct="$(git -C "$1" show -s --format=%ct HEAD)"
  jq -cn --arg l "$2" --argjson t "$((ct + $3))" '[{label: $l, at: ($t | todateiso8601)}]'
}

check() { # name dir base head labels expected_status expected_substring
  local name="$1" dir="$2" base="$3" head="$4" labels="$5" want_status="$6" want_text="$7"
  local out status
  out="$(cd "$dir" && BASE_SHA="$base" HEAD_SHA="$head" LABEL_EVENTS="$labels" bash "$GUARD" 2>&1)"
  status=$?

  if [ "$status" -eq "$want_status" ] && grep -qF "$want_text" <<<"$out"; then
    PASSED=$((PASSED + 1))
    printf 'ok    %s (exit %d)\n' "$name" "$status"
    printf '        %s\n' "$(grep -m1 -F "$want_text" <<<"$out" | cut -c1-150)"
  else
    FAILED=$((FAILED + 1))
    printf 'FAIL  %s — wanted exit %d containing %q, got exit %d:\n' \
      "$name" "$want_status" "$want_text" "$status"
    sed 's/^/        /' <<<"$out"
  fi
}

# ---------------------------------------------------------------------------

d="$(new_repo unrelated)"
printf 'a change\n' >"$d/README.md"
commit "$d" 'unrelated change'
check 'unrelated PR passes' \
  "$d" main HEAD '[]' 0 'touches neither'

d="$(new_repo migration-only)"
printf 'ALTER TABLE "clients" ADD COLUMN "new_col" text;\n' >"$d/drizzle/0002_add.sql"
commit "$d" 'additive migration only'
check 'additive migration alone passes unlabelled' \
  "$d" main HEAD '[]' 0 'no lib/db/schema.ts change'

# Finding #1: a schema change with no migration used to exit 0 silently.
d="$(new_repo schema-only)"
printf 'export const clients = pgTable("clients", { id: uuid("id"), added: text("added") })\n' >"$d/lib/db/schema.ts"
commit "$d" 'schema only'
check 'schema-only PR FAILS unlabelled' \
  "$d" main HEAD '[]' 1 'ships NO migration'
check 'schema-only PR passes with a fresh migration-applied label' \
  "$d" main HEAD "$(labels_at "$d" migration-applied 60)" 0 "OK — 'migration-applied'"

d="$(new_repo schema-and-migration)"
printf 'export const clients = pgTable("clients", { id: uuid("id"), added: text("added") })\n' >"$d/lib/db/schema.ts"
printf 'ALTER TABLE "clients" ADD COLUMN "added" text;\n' >"$d/drizzle/0002_add.sql"
commit "$d" 'schema + migration'
check 'schema + migration FAILS unlabelled' \
  "$d" main HEAD '[]' 1 'adds a migration and the schema change that reads it'
check 'schema + migration passes with a fresh label' \
  "$d" main HEAD "$(labels_at "$d" migration-applied 60)" 0 "OK — 'migration-applied'"

# Finding #2: the label must not survive a later push.
check 'schema + migration FAILS with a label applied before the head commit' \
  "$d" main HEAD "$(labels_at "$d" migration-applied -60)" 1 'BEFORE the current head commit'

# Finding #3: destructive migrations invert the ordering, so they need the other
# label — including when they ship alone, which is how the demo_mode drop lands.
d="$(new_repo destructive)"
printf 'ALTER TABLE "users" DROP COLUMN "demo_mode";\n' >"$d/drizzle/0002_drop.sql"
commit "$d" 'drop column'
check 'destructive migration FAILS unlabelled' \
  "$d" main HEAD '[]' 1 'DESTRUCTIVE migration'
check 'destructive migration FAILS with only migration-applied' \
  "$d" main HEAD "$(labels_at "$d" migration-applied 60)" 1 'DESTRUCTIVE migration'
check 'destructive migration passes with a fresh migration-deferred-apply label' \
  "$d" main HEAD "$(labels_at "$d" migration-deferred-apply 60)" 0 "OK — 'migration-deferred-apply'"

d="$(new_repo rename)"
printf 'ALTER TABLE "clients" RENAME COLUMN "old" TO "new";\n' >"$d/drizzle/0002_rename.sql"
commit "$d" 'rename column'
check 'renaming migration is treated as destructive' \
  "$d" main HEAD "$(labels_at "$d" migration-applied 60)" 1 'DESTRUCTIVE migration'

# DROP CONSTRAINT / DROP DEFAULT / DROP NOT NULL break no `select`.
d="$(new_repo drop-constraint)"
printf 'ALTER TABLE "clients" ALTER COLUMN "existing" DROP NOT NULL;\nALTER TABLE "clients" DROP CONSTRAINT "clients_pkey";\n' >"$d/drizzle/0002_relax.sql"
commit "$d" 'drop constraint'
check 'DROP CONSTRAINT / DROP NOT NULL are not destructive' \
  "$d" main HEAD '[]' 0 'no lib/db/schema.ts change'

# Finding #5: an unreachable base must not fail as raw git stderr.
d="$(new_repo bad-base)"
printf 'export const clients = pgTable("clients", { id: uuid("id"), added: text("added") })\n' >"$d/lib/db/schema.ts"
commit "$d" 'schema only'
check 'unreachable base fails with a named annotation, not raw git stderr' \
  "$d" 0000000000000000000000000000000000000000 HEAD '[]' 1 'could not compute the merge base'
check 'unreachable base says it is not a missing label' \
  "$d" 0000000000000000000000000000000000000000 HEAD '[]' 1 'NOT a missing label'

# The merge base, not the base tip: a schema change landing on `main` after this
# PR branched must not be pulled into the diff.
d="$(new_repo moving-base)"
printf 'a change\n' >"$d/README.md"
commit "$d" 'unrelated feature work'
git -C "$d" checkout -q main
printf 'export const clients = pgTable("clients", { id: uuid("id"), other: text("other") })\n' >"$d/lib/db/schema.ts"
commit "$d" 'someone else changed the schema on main'
git -C "$d" checkout -q feature
check 'a schema change on the base branch is not attributed to this PR' \
  "$d" main HEAD '[]' 0 'touches neither'

# ---------------------------------------------------------------------------

printf '\n%d passed, %d failed\n' "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ]
