# AEO Outbound: moving the tool to production (plan only, nothing executed)

**Date:** 2026-11-02. **Status:** read-only research. Nothing here has been run against production. **Gate:** nothing
starts until Paul has approved #434, #431, #432 and #433, they are merged to `dev` and promoted to staging, and Ryan has
signed off on staging.

**Update 2026-11-03.** Paul approved all four; merged to `dev` in order (#434 `39cc80fb`, #432 `a4ae679b`, #433
`637e7fb0`, #431 `69c3acfc`) and promoted by #435 (staging `901560ed`, its tree equal to `dev`'s). No schema or migration
change since 2026-11-02 (`git diff 05b399cc origin/staging -- lib/db/schema.ts drizzle` is empty). Staging is now 482
commits ahead of `main` (408 without merges), from 35 feature PRs; `main` still holds 4 commits staging lacks (#401 and
two old promotion merges). A signed-in PDF export on staging (Renaissance, Organic Social, `last_month`) returned a 10-page
PDF of 2.18 MB from Chromium 153 on 2026-11-03; the acceptance script's layout checks were not run on it.

Every fact below cites the commit, file or record it was read from (refs as of 2026-11-02: `main` `17aa47db`, staging
`05b399cc`, `dev` `4cf99df2`). Anything that could not be read from here is marked **Unverified** with the read-only
check that settles it.

## 1. What production is today

- **The tool is not on production.** `main` has no `lib/aeo-outbound/` and its migrations stop at `0025`
  (`git ls-tree origin/main drizzle/`). Staging has `0026` to `0029`.
- **A staging to main promotion ships more than the tool.** Staging is 451 commits ahead of `main`. Outside the tool's
  own files (`lib/aeo-outbound`, `components/aeo-outbound`, `app/tools/new-business`, `app/api/aeo-outbound`,
  `app/snapshot`), it carries, on Renaissance's live path:
  - Bulk PDF export (#386, 2026-10-14): `lib/export/bulk.ts`, `lib/export/pages.ts`, `components/export-pdf-button.tsx`,
    both report pages.
  - The Neon network-transfer fix for the Organic Social lock sweep (`651cd21e`, `0c0de4a2`, `c6edad3b`, 2026-10-21).
  - The Next.js security bump 16.3.8 to 16.4.1 (`4603ae7c`, GHSA-2464-fhr4-w9xw, GHSA-p3m5-59mp-jv5r).
  - New Business in the Tools list (`2a994744`, `lib/constants.ts`).
- **Production runs the lock sweep without the transfer fix.** `main`'s `vercel.json` schedules `/api/lock-sweep`
  hourly, and `main` lacks `651cd21e`, which the commit records as the cause of the Neon project using its 5 GB monthly
  transfer on 2026-10-21 (about 9.5 MB a run, every hour). **Unverified:** whether production's database is in the same
  Neon project (and quota) as dev and staging, and whether production's sweep has opted-in clients to sweep. This is a
  production risk today, independent of the tool. The tool-only release (step 1) does not change it.

## 2. What the tool needs at runtime (read from staging's code)

| Need | Source | Production today |
|---|---|---|
| Four tables: `aeo_outbound_reports`, `_opens`, `_settings`, `_settings_log`, plus the `aeo_outbound_status` enum | `drizzle/0026` to `0029`; additive, no existing table touched | Absent (migrations not on `main`). **Unverified** in the database itself |
| `PEEC_AI_CUSTOMER_TOKEN` | `lib/aeo-outbound/peec.ts:207` | Set for Production, Preview and staging (Vercel, read 2026-11-02) |
| `GLEAN_INSTANCE`, `GLEAN_API_TOKEN` | `lib/aeo-outbound/glean.ts:36` | Set for Production, Preview and staging (Vercel, read 2026-11-02) |
| `GLEAN_ACT_AS` | `glean.ts:37`: `true` acts as the signed-in user and needs an organization-wide token; unset runs as the token's own user (`.env.example:63`) | Set as one entry for Production, Preview and staging (Vercel, read 2026-11-02), so production's mode already matches staging's |
| `AEO_OUTBOUND_USERS` | `access.ts:22`: the floor list of users, every one an admin | Set as one entry for Production, Preview and staging (Vercel, read 2026-11-02; value not read). With an empty settings table it is the only way in (`access.ts`; `settings.ts:62` falls back to defaults) |
| Public link domain | `share-origin.ts`: `VERCEL_TARGET_ENV=production` gives `https://reporting.avenuez.com` (set by Vercel) | Nothing to set |
| Login | `/tools/*` is behind the proxy (`proxy.ts:25`); `/snapshot` is public by design | Google sign-in already works on production |

Settings, users and every report live in the database, so nothing Ryan set on staging carries over: production starts
with the defaults and an empty hub.

## 3. The database: what the repo's own record says

`MIGRATIONS-PENDING.md` (on staging, absent from `main`) is the migration record. It says:

- Use `scripts/migrate-http.ts` for every environment. It hashes each migration and checks it against
  `drizzle.__drizzle_migrations`. Never `npm run db:migrate`, `db:migrate:staging` or the `db-migrate.yml` workflow:
  `drizzle-kit migrate` is timestamp-gated, can skip a migration silently and exit 0, and has hung against Neon.
- Apply before the code merges, and verify with a direct query, never a migrator's exit code.
- As of 2026-09-11, production's ledger stopped at `0019` and production lacked `salesforce_config`, `ga4_config` and
  `hidden_journey_stages`; the production steps for `0020` to `0023` are still marked pending. `0020`'s `CREATE TABLE` has
  no `IF NOT EXISTS` and the table already exists on production, so it must go through `migrate-http.ts`, which records it.

**Contradiction, unresolved:** `main`'s schema names all three columns on every client read
(`lib/db/schema.ts:228`, `:230`, `:236`), and the record says a missing one takes the whole app down. Production is in
use, so they were most likely applied after the record was written. Until it is checked, assume nothing about
production's ledger: `migrate-http.ts` applies every missing migration in journal order, so if production is behind on
`0020` to `0025`, running it for the tool would apply those too.

## 4. The move, in order (each step a separate decision; none started)

**Step 0. Read-only checks** (you, in the Neon SQL editor on production, or give me a read-only connection through the
hidden-paste command; nothing below writes):

```sql
-- Which migrations production has recorded, and how many.
select count(*), max(created_at) from drizzle.__drizzle_migrations;
select hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 8;
-- The three client columns the record calls pending.
select column_name from information_schema.columns where table_name = 'clients'
  and column_name in ('salesforce_config', 'ga4_config', 'hidden_journey_stages');
-- The tool's tables (expect none).
select to_regclass('public.aeo_outbound_reports'), to_regclass('public.aeo_outbound_settings');
```

Plus, in Neon: which project and plan production's `DATABASE_URL` points at, and its network transfer used this month.
(Vercel done 2026-11-02, names only: every variable the tool reads exists for Production; `CONTRACT_DISABLED` does not.)

I compare the hashes against the journal (`drizzle/meta/_journal.json`, entries 0 to 25 on `main`) and report exactly
which migrations production is missing before anything is applied.

**Step 1. Build a release branch with the tool only (decided 2026-11-02: only Ryan's tool goes to production).** The
documented flow promotes all of staging to `main`; this is a deliberate exception. Cut `release/aeo-outbound` from
`main` and bring over only what the tool needs, read from the code:

- The tool's own folders, whole, from staging after #434, #431 and #432 land there: `lib/aeo-outbound/`,
  `components/aeo-outbound/`, `app/tools/new-business/`, `app/api/aeo-outbound/`, `app/actions/aeo-outbound.ts`,
  `app/snapshot/`, `scripts/aeo-outbound-sweep.ts`, `drizzle/0026` to `0029` and their journal entries and snapshots.
- The tool's lines in shared files, by hand, not the whole files:
  - `lib/db/schema.ts`: the `aeo_outbound_status` enum and the four tables (staging's only schema change; nothing removed).
  - `package.json`: declare `"zod": "4.6.6"` (`main` does not declare zod at all; the tool imports it in
    `contracts.ts` and `store.ts`, and it only resolves today because another package pulls 4.3.6 in) and the
    `aeo:sweep` script. Not `next` 16.4.1 and not `pdf-lib` (bulk export). The lockfile is regenerated from that.
  - `lib/constants.ts`: the New Business entry in the Tools list (`2a994744`), or the tool has no menu link.
  - `app/tools/layout.tsx`: the editor-space change (#396, #399), which only applies inside the report editor.
  - `vitest.config.ts`: the tool's test globs, not the bulk export test's.
  - `lib/auth/api-routes.test.ts`: the tool's routes in the list of routes that check their own session.
  - `.env.example`: `GLEAN_ACT_AS`, `AEO_OUTBOUND_USERS`, `VERCEL_TARGET_ENV`.
- Checked: of every module the tool imports from outside its folders, only `lib/db/schema.ts` differs between `main`
  and staging (`auth.ts`, `lib/auth/page-access.ts`, `lib/auth/route-access.ts`, `lib/commentary/permissions.ts`,
  `lib/db/client.ts` and `lib/glean.ts` are identical). Its outside packages (`drizzle-orm`, `lucide-react`, `next`,
  `react`, `zod`, `node:crypto`) are all on `main`.

This build (main plus the tool) has never run as a whole on staging, so before it merges: the full test suite,
type-check and `check:rsc` on the release branch, its Vercel preview checked by hand (previews use the dev database,
which has `0026` to `0029`), and `npm run aeo:sweep`. It goes through its own PR into `main` with the self-review label
and your go-ahead.

**Not shipping, and what that leaves on production:**
- The Neon transfer fix for the lock sweep (`651cd21e`, `0c0de4a2`, `c6edad3b`): production keeps running the pre-fix
  sweep every hour (section 1). Ship it on its own if step 0 shows production shares the quota or is near it.
- The Next.js security bump (`4603ae7c`): production stays on 16.3.8. A candidate for its own small release.
- Bulk PDF export (#386) and the puppeteer bump (#433): stay on staging. Production keeps `chromium-bidi`'s zod 3.25.76
  copy (GHSA-mrhx-c7xc-m3w5) as it has today, so the release PR's `checks / checks` sca gate stays red. `main` does not
  require that check (read 2026-11-03).
- Everything else in staging and not in `main` stays off production too: 35 feature PRs sit between them (2026-11-03), and
  only the tool's files and the shared lines listed above are copied. Re-checked 2026-11-03 on staging `901560ed`: the
  tool's 76 source files import seven modules from outside their folders; six are identical on `main` and
  `lib/db/schema.ts` differs only by the tool's enum and four tables (96 lines added, none removed).

**Step 2. Migrate production, before the code.** `CACHE_DISABLE=1 npx tsx --env-file=<production env file>
scripts/migrate-http.ts`, with production's own connection string, never by editing the staging guard. It applies what
step 0 found missing, in order, ending at `0029`. Then re-run the step 0 queries; every one must show the expected
result before step 4. `0026` to `0029` only add the tool's own tables, so nothing else reads them.

**Step 3. Production env vars.** Nothing to add: every one exists for Production (Vercel, 2026-11-02). Only check that
`AEO_OUTBOUND_USERS`, one value shared by every environment, lists everyone who should generate reports on production.

**Step 4. Merge the release branch into main.** One PR, with the self-review comment and `self-reviewed` label, local
checks if CI minutes are out, and your explicit go-ahead. Vercel deploys `main` to production.

`main` only takes PRs whose head is `staging`: `main-promotion-gate` requires `require-from-staging`
(`.github/workflows/guard-main.yml`), and the ruleset has no bypass actors (read 2026-11-03). #401 shipped the same way
(`release/tiktok-video-views-main`, 2026-10-15) and the ruleset was edited at the minute it merged. So this merge needs
you or Paul to lift that one required check in the ruleset for the merge and put it back right after; Claude Code will
not change rulesets or merge around required checks. The other required checks (`require-self-review`, `rsc-boundary`,
`test`) still have to pass.

**Step 5. Verify on production.**
- Read only first: the hub loads for Ryan; Settings shows the defaults; `/snapshot/<anything>` answers "not available".
- Then one real report (a write): generate a draft from a live Peec project and check its Cited Sources and notes.
- Approve it and confirm the `reporting.avenuez.com` link opens signed out, and counts one open from another browser.
- Neon transfer the next day (the pre-fix lock sweep is still running on production, section 1).

**Step 6. Ryan's setup on production.** Re-enter any settings he changed on staging (section titles, wordmark, report
name, users). Staging links keep working where they are; final links come from production from then on.

## 5. Rollback

`0026` to `0029` are standalone, so reverting `main` to `17aa47db` leaves the tables in place, unread and harmless. The
tool's pages and `/snapshot` route disappear with the code, so **any production link sent before a rollback stops
opening** until the tool is restored. That is the reason to send production links only after step 5 passes.

## 6. Open questions (yours)

1. Does production's database share a Neon transfer quota with dev and staging, and is it near the limit now?
2. ~~Promote all of staging?~~ Decided 2026-11-02: only the tool (step 1). Open instead: ship the lock sweep fix and the
   Next.js security bump to production separately?
3. Who goes on `AEO_OUTBOUND_USERS` for production?
4. ~~Which Glean token type does staging use?~~ Settled: one `GLEAN_ACT_AS` entry covers every environment.
