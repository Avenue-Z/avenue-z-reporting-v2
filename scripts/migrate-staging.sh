#!/usr/bin/env bash
# Apply pending Drizzle migrations to the STAGING Neon branch — and only that branch.
#
# Why this exists as a script rather than a one-liner: the dev, staging, and prod
# connection strings are near-identical, and the command that migrates staging is
# character-for-character the command that migrates PRODUCTION apart from a host we
# cannot eyeball reliably. So the target is allow-listed by endpoint id, and anything
# that is not staging is refused before drizzle-kit is ever invoked.
#
# The allow-list is deliberately positive: this script has no idea what prod's endpoint
# is, and does not need to. Anything that isn't staging is not staging.
#
# Usage:  npm run db:migrate:staging
# Needs:  .env.staging (gitignored) containing the staging branch's UNPOOLED URL:
#             DATABASE_URL_UNPOOLED=postgres://...ep-restless-union-aqkw7ig0.../...
#
# Mechanism: drizzle.config.ts calls dotenv's config({ path: '.env.local' }), and dotenv
# does NOT override variables already present in the environment. So exporting
# DATABASE_URL_UNPOOLED here wins over .env.local, and dev's URL is never consulted.

set -euo pipefail

# The staging Neon branch. From the staging environment setup (2026-07-08).
# dev is ep-still-tree-aqs8ui6d — if you see THAT here, you are pointed at the wrong branch.
readonly STAGING_ENDPOINT='ep-restless-union-aqkw7ig0'
readonly ENV_FILE='.env.staging'

cd "$(dirname "$0")/.."

if [[ ! -f "$ENV_FILE" ]]; then
  cat >&2 <<EOF
REFUSING: $ENV_FILE not found.

Create it (it is gitignored) with the staging branch's UNPOOLED connection string:

    DATABASE_URL_UNPOOLED=postgres://...${STAGING_ENDPOINT}.../neondb?sslmode=require

Get it from the Neon console with the 'staging' branch selected — take the
DIRECT/UNPOOLED string, not the pooled one. drizzle-kit migrates over a direct
connection.
EOF
  exit 1
fi

# Read only the key we need. Tolerates quotes and 'export ' prefixes; ignores everything else.
STAGING_URL="$(
  grep -E '^[[:space:]]*(export[[:space:]]+)?DATABASE_URL_UNPOOLED=' "$ENV_FILE" \
    | tail -n 1 \
    | sed -E 's/^[[:space:]]*(export[[:space:]]+)?DATABASE_URL_UNPOOLED=//; s/^["'\'']//; s/["'\'']$//'
)"

if [[ -z "$STAGING_URL" ]]; then
  echo "REFUSING: $ENV_FILE has no DATABASE_URL_UNPOOLED." >&2
  exit 1
fi

# THE GUARD. Everything above is plumbing; this is the part that matters.
if [[ "$STAGING_URL" != *"$STAGING_ENDPOINT"* ]]; then
  cat >&2 <<EOF
REFUSING: the URL in $ENV_FILE does not point at the staging endpoint.

  expected endpoint : $STAGING_ENDPOINT
  URL host          : $(sed -E 's#^[^@]*@##; s#/.*$##' <<<"$STAGING_URL")

This script migrates staging and nothing else. If you meant to migrate dev, use
'npm run db:migrate'. If you meant to migrate PRODUCTION, this is not the tool —
do that deliberately, not by editing a guard.
EOF
  exit 1
fi

echo "Target: staging Neon branch ($STAGING_ENDPOINT)"
echo "Applying pending migrations from ./drizzle …"
echo

DATABASE_URL_UNPOOLED="$STAGING_URL" npx drizzle-kit migrate

echo
echo "Done. Verify with the staging branch selected in the Neon SQL Editor:"
echo "    SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 3;"
