# Remove unused API routes and dead demo code: design

Status: for review and approval before any code. Written 2026-10-12 against `origin/dev` `ab16a5bb`.

## Goal
Delete two API routes and the code that only they use. Nothing in the app calls them, so nothing a user or client sees
changes, and the codebase gets smaller.

## What gets removed, and why it's unused
1. `app/api/pr-placements/route.ts`. Superseded: the PR placements report fetches its articles on the server itself
   (`components/report-sections/pr-placements/index.tsx:132`). Nothing fetches this route (git grep over `app`,
   `components`, `lib`, `scripts`, `e2e`).
2. `app/api/glean/meeting-brief/route.ts`, its only caller `components/meeting-prep/index.tsx` (the `MeetingPrepBrief`
   widget, which nothing renders), and `lib/demo-auth.ts`. The route depends on the old demo login, retired with demo
   mode in June (`docs/superpowers/specs/2026-06-25-remove-demo-mode-design.md`); nothing in the app sets that session
   any more, so no user can reach the widget or the route. `lib/demo-auth.ts` has no other importers.
- Production request logs for both paths (Vercel, retained days): no requests. Supporting evidence only; open question 1.

## Change (one PR off `dev`, branch `chore/remove-unused-api-routes`)
Delete: the four files above.
Edit only what the deletion leaves dangling:
- `lib/glean.ts`: remove `getLast7DaysRange` (`:20`) and `buildMeetingPrepPrompt` (`:102`), used only by the deleted
  route. Keep `GLEAN_BASE_URL` and `getGleanHeaders` (`lib/dashboard/nl/glean-chat.ts:1`) and `gleanChat`
  (`lib/peec/synopsis.ts:2`, `pr-influence-synopsis.ts:2`, `content-impact-synopsis.ts:3`). Reword the comment at
  `:30-34` that names the deleted route.
- `lib/dashboard/nl/types.ts:22`: reword the comment that names the deleted route.
- `ENGINEERS.md:82, 83, 146, 214, 338, 352-354`: drop the two routes and the widget from the tree; the PR data line says
  the report fetches server-side; the Glean lines say Glean backs the dashboard proposer and the Peec synopses. Keep
  `:121` (the live `report-sections/pr-placements/` folder).
- `Guides/prplacements.md` (current per the README Documentation Map) `:13, 207-329, 553, 573`: replace the API-route
  architecture and the "go through the API route" constraint with "the report fetches server-side".
- `Guides/gleansdk.md` (mostly current): a short note at the top that the meeting-prep widget and its route were removed
  in October 2026 and `lib/glean.ts` now serves the proposer and the synopses; update its README row (`README.md:31`).
- `.env.example:60`: retitle the Glean header to its remaining users. Env vars stay.
Leave: dated plans, specs and feedback logs (history, including `docs/official-feedback/status.md:186`); the vestigial
`meeting-prep` filter strings (`components/layout/portal-sidebar.tsx:66`, `app/dashboard/settings/page.tsx:173`; it is
not a `ReportSlug`); the `pr-placements` report; the staff-only settings description "Meeting Prep briefs"
(`settings/page.tsx:37-38`, a copy follow-up); env vars `NEWSAPI_AI_KEY`, `GLEAN_*` (still used).

## Behaviour after
- Both paths return 404 (no route; the only catch-all is `app/api/auth/[...nextauth]`). No other route changes.
- The PR placements report, the Peec synopses and the dashboard's Glean proposer work as before (they never used these).

## Failure and risk
- If an outside tool called either route, it gets 404: open question 1 before merge; rollback is a revert.
- A leftover import breaks typecheck or build: caught by `make check`. Locally, delete `.next` first (`tsconfig.json`
  includes `.next/dev/types/**`, whose generated validator still imports both routes).
- Staging and production keep the routes until each promotion; old Vercel deployment URLs keep serving them after that
  (open question 2).

## Tests (written first)
1. `lib/auth/api-routes.test.ts`, modelled on `lib/auth/protected-pages.test.ts:1, 10-13` (`@vitest-environment node`,
   recursive `readdirSync`). It walks all of `app/` and keeps files named `/^route\.(ts|tsx|js|jsx|mjs)$/` (so
   `route.test.ts` is excluded), and asserts the sorted list equals an explicit allowlist of the 10 routes that remain:
   `auth/[...nextauth]`, `auth/supermetrics-callback`, `cache-warm`, `discovery/sm-dimension-values`, `export/pdf`,
   `health/sweep`, `lock-sweep`, `perf/boundary`, `shopify/callback`, `shopify/install`. Every API route is listed here,
   so adding one is deliberate. **Add the file to `vitest.config.ts` `include`** (the list pins `lib/auth` tests one by
   one, `:44-45, 55-58, 63`) and prove RED before the deletion: the run lists the test and it fails on the two extra routes.
2. `make check` passes (typecheck, all tests, RSC check, build with CI's placeholder `DATABASE_URL`).
3. Local smoke: both paths return 404; the PR placements report and an AEO page still render.

## Out of scope
Any other route or access change (separate items), the Shopify install and callback routes (a one-time local setup tool,
filed separately), and the settings copy.

## Open questions
1. Does anything outside the app call `/api/pr-placements` or `/api/glean/meeting-brief`?
2. Old Vercel deployment URLs keep serving deleted routes. Accept, or delete old deployments after the production
   promotion?
