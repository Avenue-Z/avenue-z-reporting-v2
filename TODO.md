# TODO

Standing tasks for the Avenue Z reporting platform, surfaced during the Postgres/Drizzle migration (PRs #8 / #13 / #14, May 2026). Newest items at top of each section.

---

## 🔒 Blocked / waiting on external action

### Renaissance GA4 access
The service account `avenue-z-reporting@avenue-z-reporting.iam.gserviceaccount.com` needs **Viewer** access on GA4 property `310998391` (Renaissance Benefits). Currently blocked by two independent issues:

1. Google bug active since April 2026 — the GA4 UI rejects service-account emails with "This email doesn't match a Google Account."
2. `avenuez.com` Workspace admin blocks the `analytics.manage.users` OAuth scope, so the gcloud-based grant path also fails.

**Unblocker:** Workspace admin needs to whitelist OAuth client ID `32555940559.apps.googleusercontent.com` (Google Cloud SDK) under admin.google.com → Security → Access and data control → API controls → App Access Control. Once whitelisted, run the `gcloud auth application-default login` + `curl` flow from Thomas Chang's May 27 handoff doc. ~15 minutes once unblocked.

Until granted, Renaissance's GA4 metrics show `--` (graceful degradation).

---

## ⚡ Small follow-ups (each < 1 hour)

### Fix hardcoded "Avenue Z" in `profound-ai/tracked-prompts-chart.tsx`
We did this for `peec-ai/tracked-prompts-chart.tsx` in PR #13 — the Profound version has the identical pattern. Take a `brandName?: string` prop, replace the three "Avenue Z" tooltip strings, pass it from `peec-ai/index.tsx` where `ProfoundTrackedPromptsChart` is used.

### Update onboarding docs for DB-backed model
`docs/google-cloud-setup-avz-reporting.md` and `ENGINEERS.md` were updated in this PR. Worth a second pass once you onboard a real new client end-to-end — the GCP setup doc should walk through the new SQL-insert-instead-of-env-var flow with screenshots.

### Add `updated_at` auto-update trigger on `clients`
The `clients.updated_at` column has `DEFAULT now()` on insert but no trigger to refresh on update. Future mutations via Drizzle Studio or an admin UI will leave `updated_at` showing the creation time. Add a `BEFORE UPDATE` trigger in a follow-up migration when mutations become a real workflow.

### Seed-script silent null fallback warning
`scripts/seed.ts` falls back to `null` if certain env vars aren't set. If a new environment is bootstrapped without those env vars, client rows get nulls and reports fail with confusing errors. Add a `console.warn` when the fallback triggers, or fail loudly.

### "PR Proof Library not connected" empty-state investigation
Renaissance's Peec AI → PR Influence section showed this message during smoke testing despite `prProofSheetId` being populated in the DB. Likely a Google Sheets API permission issue (service account not shared on the sheet). Verify the SA has read access to sheet `1tcZZ3p0Syy_525xnyW0V8fXnB8No7jBFVoqjIzT1F8M`.

### Auth.js v5 cancel-flow 500
When users click **Cancel** on Google's OAuth consent screen, Auth.js v5 returns 500 with `response parameter "iss" (issuer) missing` instead of redirecting back to `/login`. Pre-existing v5 quirk on the cancel path. Either add an `error` page handler or downgrade the issuer check on the Google provider.

### Remove `[forms-debug]` console.log statements
`lib/hubspot/client.ts` has debug logging that spams Vercel function logs on every `getFormSubmissionCounts` call. Was left in place pending resolution of a customer-column bug. Confirm the bug is resolved, then strip the logs.

---

## 🏗️ Larger initiatives (proper projects with their own design)

### Admin UI for managing clients + users
Today, onboarding a new client requires either SQL or Drizzle Studio. A small admin-only page in `/dashboard/admin/clients` would let internal users add/edit clients, manage user/role assignments, and update per-client config without touching the DB directly.

### Refresh token storage (Supermetrics branded auth)
For client-OAuthing into their own platforms via Supermetrics branded login links, we need a place to persist refresh tokens. A new `oauth_tokens` table keyed by `(client_id, platform)` with encrypted-at-rest tokens. Pairs with finishing the Supermetrics integration (see CLAUDE.md cleanup item below).

### Password hash storage for external client credential login
`auth.ts:authorize()` currently accepts any password — fine for internal preview, must be fixed before external client accounts ship. Add a `users.password_hash` column, hash on insert with bcrypt/argon2, compare in the callback. New migration.

### Audit log table
Track sign-ins, role changes, config edits for compliance. Probably an `audit_events` table with `(actor_email, action, target_type, target_id, payload jsonb, created_at)`.

### Neon branching for Vercel previews
Set up the [Neon Vercel integration](https://vercel.com/integrations/neon) on the dev Neon project so each PR gets an auto-created, copy-on-write DB branch. Previews stop sharing state with each other. ~30 min one-time setup; no code change.

### Analytics consolidation onto BigQuery
Most report sections (GA4 main, HubSpot, GSC, etc.) hit live vendor APIs on every page request, causing 1–3s page loads. Migrate to query BigQuery — Supermetrics already populates some tables there for the FFCI report. Cuts page loads to sub-second and reduces API quota burn.

### Sidebar Client/Server component split
`components/layout/sidebar.tsx` and `portal-sidebar.tsx` are `'use client'` components that receive `clients: Client[]` as a prop from their async Server Component parent layouts (the "parent-prop" pattern we chose for the DB migration). A future refactor can split each sidebar into a thin Server Component wrapper + a Client Component child — the Next.js App Router-idiomatic pattern. Documented in `docs/superpowers/specs/2026-05-19-postgres-config-store-design.md` § "Open / future work".

### Supermetrics scaffolding decision
`lib/supermetrics/` exists but isn't wired to any live section. Two paths: (a) finish the Supermetrics integration to power the placeholder report sections (Meta Ads, Google Ads, Email Marketing, etc.), or (b) delete the scaffolding and update `CLAUDE.md` so it stops describing a Supermetrics-first architecture in the present tense. Pick a direction.

---

## 🧹 Code hygiene (no-deadline cleanups)

### 38 pre-existing lint errors
`npm run lint` surfaces ~38 errors across the codebase (mostly `Unexpected any` and minor React Compiler warnings in HubSpot/Peec/Profound clients). Not introduced by recent work; worth a dedicated cleanup pass.

### `package-lock.json` audit warnings
`npm audit` shows 16 vulnerabilities (3 low / 4 moderate / 9 high / 1 critical) from transitive deps. Investigate which are actually exploitable vs. just dependency churn.

### Unused env vars audit
Periodically check Vercel env vars against actual code references. The recent PR removed 5 stale ones (`GA4_PROPERTY_ID_*`, `GSC_SITE_URL_*`, `PEEC_AI_ACCESS_TOKEN`); future migrations may leave their own debris.
