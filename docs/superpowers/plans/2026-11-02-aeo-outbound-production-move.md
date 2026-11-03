# Promoting staging to production (plan only, nothing executed)

**Updated 2026-11-03.** Decided today: Paul says all of staging is fine to promote, so this is a normal `staging` to
`main` promotion, not the tool-only release branch the 2026-11-02 version of this plan described (that version is in
this branch's history). **Gate:** nothing starts until Ryan has given his feedback on staging and signed off. Nothing
here has been run against production; every fact below was read from git, GitHub, Vercel or staging on 2026-11-03.

Refs read: `main` `17aa47db`, `staging` `9ce8a2f8` (tree identical to `dev` `628803e9`).

## 1. What ships

`main..staging` is 487 commits (411 without merges), 222 files (199 added, 23 changed), from 36 feature PRs through 14
promotions. `main`'s 4 commits staging lacks merge cleanly (`git merge-tree`), and its one code change (#401, TikTok
Video Views) is already on staging as #400 (`git cherry` marks it `-`).

| Area | PRs | What production gets |
|---|---|---|
| AEO Outbound tool (Ryan) | #361, #366, #368, #388, #391, #393, #399, #402, #403, #405, #410, #413 to #415, #417, #420, #422, #424, #426 to #428, #431, #434, #436 | Tools > New Business: generate, edit, approve and send snapshots; public `/snapshot/<token>` links |
| Bulk PDF export (Paul) | #386 | Export PDF on both report pages opens a page picker and downloads one PDF (`pdf-lib`) |
| Lock sweep Neon fix (Paul) | #407 | The hourly sweep runs only around a month's lock day; lock reads cached by row id |
| Dependencies | #408, #418, #432, #433 | vite 7.3.7, Next 16.4.1, zod 4.6.6, puppeteer-core 25.16.0 |
| Organic Social TikTok | #400 | Already on production as #401 |
| Tests and docs only | #367, #387, #389, #395, #409 | Nothing a user sees |

Shared files outside the tool that change: both report pages and `components/export-pdf-button.tsx` (bulk export),
`lib/constants.ts` (the New Business entry in Tools), `app/tools/layout.tsx` (only the report editor goes full width),
`lib/organic-social/lock-sweep.ts` and `response-lock-store.ts` (Neon fix), `lib/db/schema.ts` (the tool's enum and four
tables only: 96 lines added, none removed), `package.json` and the lockfile.

Unchanged between `main` and staging (so nothing to do): `proxy.ts` (already protects `/tools/*`; `/snapshot` is public
by design), `auth.ts`, `vercel.json` (same crons, including the hourly `/api/lock-sweep`), `next.config.*`, every file in
`.github/workflows`.

## 2. Database

Staging adds four migrations, `0026` to `0029`. Every statement creates or alters only the tool's own tables
(`aeo_outbound_reports`, `_opens`, `_settings`, `_settings_log`, the `aeo_outbound_status` enum); none touches an
existing table or deletes anything. The hub reads these tables on load, so they must exist before the code deploys.

`scripts/migrate-http.ts` applies every journal entry whose hash is not in `drizzle.__drizzle_migrations`, and treats an
"already exists" error as applied. The repo's record (`MIGRATIONS-PENDING.md`) says production's ledger stopped at
`0019` as of 2026-09-11, so the script may also run `0020` to `0025`. I read all of them: each is `CREATE TABLE`,
`CREATE TYPE`, `CREATE INDEX`, `ADD COLUMN` or `ADD CONSTRAINT`, so on a database that already has them every statement
fails with "already exists" and nothing changes. Step 2 below confirms the real state before anything is applied.

## 3. Environment

New variables the code reads: `AEO_OUTBOUND_USERS`, `GLEAN_ACT_AS`, `GLEAN_INSTANCE`, `CONTRACT_DISABLED`,
`VERCEL_TARGET_ENV`. Read from Vercel 2026-11-03 (names and targets only, no values): `AEO_OUTBOUND_USERS`,
`GLEAN_ACT_AS`, `GLEAN_INSTANCE`, `GLEAN_API_TOKEN` and `PEEC_AI_CUSTOMER_TOKEN` each exist for production, preview and
staging. `CONTRACT_DISABLED` is set nowhere, as on staging (contracts enforce). `VERCEL_TARGET_ENV` is set by Vercel and
makes production links `https://reporting.avenuez.com/snapshot/...`. Nothing to add.

## 4. Settings and access

Production's settings table starts empty, so it runs on `SETTINGS_DEFAULTS` (`lib/aeo-outbound/settings.ts:13`).
Staging's Settings page on 2026-11-03 matches those defaults field for field (Avenue Z, AI Visibility Snapshot, Cited
Sources, Competitive Visibility, the same next-step sentence word for word, rank among every brand, methodology on, no
extra users). Access comes from `AEO_OUTBOUND_USERS`, one entry shared by every environment, which lists Paul, Ryan, Tina
and me. So production behaves exactly as staging does with nothing to re-enter. Reports and links do not carry over:
production starts with an empty hub, and staging links keep working where they are.

## 5. The move, in order (each step waits for the one before)

**Step 0. Re-check (read only, about 5 minutes).** If anything below differs from section 1, stop and re-run this plan's
inventory.

```bash
git fetch origin main staging dev
git rev-parse --short=8 origin/main origin/staging   # expect 17aa47db and the staging tip Ryan approved
git rev-list --count origin/staging..origin/dev      # expect 0, or know what is extra
git diff --name-only origin/main origin/staging -- drizzle vercel.json proxy.ts auth.ts .github   # expect only drizzle 0026 to 0029
```

**Step 1. Production database, read only (you, Neon SQL editor, production branch).**

```sql
select count(*), max(created_at) from drizzle.__drizzle_migrations;
select column_name from information_schema.columns where table_name = 'clients'
  and column_name in ('salesforce_config', 'ga4_config', 'hidden_journey_stages');   -- expect all three
select to_regclass('public.aeo_outbound_reports'), to_regclass('public.aeo_outbound_settings');   -- expect null, null
```

Also note the project's network transfer used this month. Share the results; I compare the ledger with
`drizzle/meta/_journal.json` and say exactly what the migration will apply.

**Step 2. Migrate production (a write; only on your go).** Put production's direct (non-pooler) connection string in a
gitignored file under the key `DATABASE_URL_UNPOOLED` (the key `scripts/migrate-http.ts:19` reads first) with the
hidden-paste command, into `.env.production-migrate` (ignored by `.env*` in `.gitignore`), then:

```bash
CACHE_DISABLE=1 npx tsx --env-file=.env.production-migrate scripts/migrate-http.ts
```

Expected: `target host:` names production's host, then `apply 0026` to `0029` (and possibly `0020` to `0025`, each
ending in no change). Re-run step 1: the two `to_regclass` values must now be non-null. Keep or delete the env file
after, your call (the value also lives in Vercel).

**Step 3. The PR.** Open `staging` to `main`. Required checks (`main-promotion-gate`): `require-from-staging` (passes:
the head is `staging`), `rsc-boundary`, `test`, and `require-self-review`, which only passes once the `self-reviewed`
label is on (`.github/workflows/self-review.yml`). I post the self-review comment (what each area does and why, from
section 1), then add the label. The PR's Vercel link is staging's own deployment of that commit (Vercel environment
`staging`, as on #385), so that is the link Paul checks; it runs on staging's database. If Actions minutes are out, I
run the checks locally and post the output.

**Step 4. Merge (you).** After Paul's check and your go. Merge commit, as every promotion so far. Vercel deploys `main`
to production.

**Step 5. Verify on production.**
- Read only first: the hub loads at `/tools/new-business`; Settings shows the values in section 4;
  `/snapshot/anything` answers "This link is not available."; a Renaissance report page loads and its Export PDF
  opens the page picker.
- Then one write: generate one report from a live Peec project and read its Cited Sources box and donut.
- Approve it, open its `reporting.avenuez.com` link signed out, and check the hub counts the open from another browser.
- Next day: the lock sweep log and Neon network transfer.

Only after step 5 passes do final links go to prospects.

## 6. Rollback

First, Vercel's instant rollback: promote the previous production deployment back (no git change, takes effect in
seconds). Then fix forward or revert in git; a revert PR into `main` has a head other than `staging`, so it needs the
same one-time lift of `require-from-staging` that #401 used. The tool's tables stay, unread and harmless. The tool's pages and every `/snapshot` link stop working until it is restored, which is why no production link
is sent before step 5 passes. Bulk export, the Neon fix and the dependency bumps revert with it.

## 7. Open, not blocking

- Tina has not QA'd the bulk PDF export or the Neon fix on staging. Paul owns both and says they are ready.
- The signed-in PDF export on staging (#433 follow-up) returned a 10-page PDF of 2.18 MB on 2026-11-03; the acceptance
  script's layout checks were not run on it.
- `npm dedupe` (two patched zod copies) is cleanup only and can wait.
