# Handoff: testing the admin-panel branch (`repo-admin-panel`)

For Paul. This branch adds internal/external admin access control. It has been
type-checked, production-built, and live-tested against a Neon branch
(integration suite 19/19). To test it yourself you need to do a few setup steps —
it is **not** pull-and-run, mainly because the DB migration must be applied.

> **Heads up — the production shared password has NOT been set.** No client can
> log in on the client side until a shared password is set for that client (the
> system fails closed by design). For local testing you set a *test* password
> (step 4). The real one is chosen by Avenue Z in the dashboard at launch.

---

## What's already done (nothing for you to do here)
- All code committed + pushed on `repo-admin-panel` (PR #94). `main` already
  merged in; build, tsc, and the RSC boundary check pass.
- Migration `drizzle/0011_huge_cobalt_man.sql` is committed (additive: adds
  `clients.shared_password_hash` + `clients.max_seats`). It is **not** applied to
  any shared DB yet.

## What you need to do

### 1. Pull + install
```bash
git fetch origin && git checkout repo-admin-panel && git pull
npm install            # bcryptjs was added — install is required
```

### 2. Create `.env.local` (git-ignored)
Use your own test database — a **Neon branch** is easiest (Neon console →
Branches → New Branch → copy the connection string). Then:
```env
DATABASE_URL=<pooled connection string, host has -pooler>
DATABASE_URL_UNPOOLED=<same string with -pooler removed from the host>
AUTH_SECRET=<run: openssl rand -base64 32>
NEXT_PUBLIC_APP_URL=http://localhost:3000
APP_URL=http://localhost:3000
# Only needed to log into the INTERNAL dashboard via Google (see step 5a).
# Ask Thomas for these (they're in Vercel). Not needed for the client-side flow.
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
```
(Report sections need other API keys to render data, but the access-control flow
below does not — empty report panels are fine for this test.)

### 3. Apply the migration to your DB — REQUIRED
The app references the two new columns, so **it will error on every page until
the migration runs.**
```bash
npm run db:migrate
```
If your DB has no clients yet (a fresh branch off an empty parent), also run:
```bash
npm run db:seed       # inserts the sample clients (avenue-z, renaissance)
```

### 4. Give a client a TEST shared password + an external admin
Two ways — pick one:

**a) Via the dashboard UI** (also tests the internal feature; needs Google creds
from step 2): run `npm run dev`, sign in with your `@avenuez.com` Google account,
go to `/dashboard/<clientSlug>/access`, set a password, and "Assign external
admin" with any email you'll log in as.

**b) Via the helper script** (no Google needed — fastest path to the client flow):
```bash
npx tsx --env-file=.env.local scripts/dev-set-client-access.ts \
  renaissance test1234 extadmin@test.com viewer@test.com
```
This sets the shared password to `test1234` on the `renaissance` client and
provisions an external admin + a viewer.

### 5. Run it and walk the flow
```bash
npm run dev    # http://localhost:3000
```

**5a. Internal (Avenue Z) — needs Google login:** `/dashboard` → pick a client →
**Manage Access**: set/rotate the shared password, change the seat limit, assign
the external admin. (All gated to `INTERNAL_ADMIN`.)

**5b. External admin (client side) — email + shared password:** open `/login`,
sign in as `extadmin@test.com` / `test1234`. You land in that client's portal.
Open **Team** → invite `viewer2@test.com` → you get a copy-able login link →
remove a teammate. The seat cap is 5 by default (the admin counts as 1).

**5c. Viewer:** `/login` as `viewer@test.com` / `test1234` → sees only that
client's reports. No Team page.

### 6. Confirm isolation (the important part)
- As a client user, manually visit **another** client's URL,
  `/portal/<other-slug>/reports` → must redirect to `/unauthorized`.
- A **wrong password** or an **un-provisioned email** at `/login` is rejected.
- A **removed** teammate can no longer log in (effective immediately).
- Try to invite a 6th client-side user → blocked with "seat limit"; re-inviting
  someone who already has access → "already has access" (not "seat limit").

---

## Notes
- The repo has **pre-existing** lint errors in unrelated files (`components/
  data-chat/*`, `components/report-sections/*`, the `as any` in
  `portal-sidebar.tsx`) — they pre-date this branch and don't block `next build`.
- Prod rollout (when Avenue Z is ready) is in
  `docs/runbooks/2026-06-25-admin-panel-launch.md`: merge → trigger the
  "DB migrate (manual)" GitHub Action → set each client's real shared password
  in the dashboard.
