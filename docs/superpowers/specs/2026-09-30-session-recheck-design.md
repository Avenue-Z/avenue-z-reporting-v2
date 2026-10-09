# Check each login against the database on every request: design

Status: REVIEWED, two fresh-eyed rounds (2026-09-30); round 2's one MAJOR decided by me (known limit, section 3.1 row 2). Every claim is read on `origin/dev` 8502f40 (2026-09-30), and the Auth.js files in the
installed `next-auth` 5.0.0-beta.30 / `@auth/core` 0.41.0 (this branch's lockfile) and in 5.0.0-beta.32 / 0.41.3 (the
open #281's).

## 1. Why
Paul, reviewing #287 (2026-09-29, `lib/auth/route-access.ts:13`): `role` and `clientSlug` come from the token written at
sign-in, and `auth.ts` sets no session lifetime, so after `removeTeammateAction`, or when a user is moved to another
client, an existing session keeps its old access until it expires. He offered a shorter `maxAge` or a re-check in the
`jwt` callback. I chose the re-check (2026-09-30), on every request (section 2 explains why not hourly), knowing it runs
for every signed-in person, Renaissance's users included (my explicit OK under the Renaissance rule). Paul reviews this
decision specifically (section 9). Staff are re-checked too, but staff with no row get the sign-in default (section 3.1,
row 5), so the goal fully holds for client users.

## 2. What happens today
- Sign-in writes the role and slug once. The `jwt` callback sets them only when `user` is present, which is only at
  sign-in (`auth.ts:54-77`): the preview test admin's own role and slug (`:56-63`), else the user's row from
  `getClientByEmail` (`:64-67`), else `INTERNAL_ANALYST` / `avenue-z` for an `@avenuez.com` email (`:68-70`), else
  `CLIENT_VIEWER` / null (`:71-73`). `session` copies them onto `session.user` (`:78-82`).
- The `jwt` callback runs on every session read. `@auth/core` decodes the cookie and calls `callbacks.jwt` with the
  token and no `user` (`@auth/core/lib/actions/session.js:24-32`). A returned token becomes the session (`:34-43`) and
  is re-signed into a new cookie (`:44-52`); a returned `null` means no session and cookies that clear it (`:55-57`); a
  thrown error is logged as `JWTSessionError` and also means no session (`:59-63`). Identical in 0.41.3 (#281).
- Nothing saves those new cookies. Every caller uses `auth()` with no arguments (`proxy.ts:8`, the layouts
  `app/dashboard/layout.tsx:14`, `app/portal/[clientSlug]/layout.tsx:17`, 21 files in all), which reads the session
  and drops the response's `set-cookie` (`next-auth/lib/index.js:91`; beta.32 `:106`, the same). The app never fetches
  the session from the browser (no `SessionProvider`, `useSession` or `/api/auth/session` in `app`, `components`,
  `lib`). So the cookie is written only at sign-in, and a login lasts 30 days from sign-in (the Auth.js default; no
  `session.maxAge` in `auth.ts`). UNVERIFIED by a live run: read from the code only.
- One exception (Paul, #293): the public Auth.js route `app/api/auth/[...nextauth]/route.ts` serves
  `GET /api/auth/session`, and that response does apply the session action's cookies. A returned token is re-encoded
  with a new issue time and a fresh 30-day expiry (`@auth/core/lib/actions/session.js:46-51`, `@auth/core/jwt.js:57-58`),
  so each call rolls the login forward another 30 days; a `null` or a thrown error clears the cookie (`session.js:55`,
  `:58-61`). Nothing in the app calls it, but any signed-in browser can. So a login lasts 30 days from sign-in or from
  the last call to that route, and the token's own `iat` cannot tell when someone signed in.
- So an hourly re-check cannot remember when it last checked (the timestamp would live in a cookie nothing saves): after
  the first hour it would check on every request anyway. Checking on every request is the same cost, simpler, and
  takes effect on the next click.
- The lookup: `getClientByEmail` reads `users` by lower-cased email with its client (`lib/db/queries.ts:49-56`),
  wrapped in React `cache` (one read per render) and `timed` for PERF logs (`:58`). Not persistently cached, so a
  removed row is gone on the next read.
- Sessions with no user row, which the re-check must not demote:
  - the service cookie for the cache warmer and the health sweep: minted with `INTERNAL_ADMIN` / `avenue-z` for
    `cache-warm@avenuez.com` and `health-sweep@avenuez.com` (`lib/auth/service-cookie.ts:13-29`,
    `lib/cache-warm/run.ts:74`, `app/api/health/sweep/route.ts:59`; the lock sweep mints through the same
    `lib/cache-warm/run.ts:74` via `app/api/lock-sweep/route.ts:22,29`), 1 hour, one per run;
  - the preview-only test admin: `INTERNAL_ADMIN` / `avenue-z` from `evaluateTestAdminLogin`
    (`lib/auth/test-admin.ts:30-41`), never on production (`:34`).
  The credentials login returns no role (`lib/auth/credential-login.ts:35`), so it always takes the lookup path.
- CLAUDE.md states the old rule twice: "no DB hit on subsequent requests" (`CLAUDE.md:102-103`) and "no DB hit per
  request" (`:565-566`).

## 3. The change

### 3.1 `jwtCallback` moves to `lib/auth/jwt-callback.ts` (new), and `auth.ts` calls it
`jwtCallback({ token, user }, deps)` returns `Promise<JWT | null>`. `deps` is `{ lookup, testAdmin }`: `lookup` is
`(email: string) => Promise<{ role: string; slug: string } | null>` (`auth.ts` passes `getClientByEmail`), and
`testAdmin` is `{ email?: string; password?: string; vercelEnv?: string }` (`auth.ts` passes `TEST_ADMIN_EMAIL`,
`TEST_ADMIN_PASSWORD`, `VERCEL_ENV`, as it does at sign-in, `auth.ts:32-39`). It lives outside `auth.ts` because
`vitest.setup.ts` stubs `@/auth`, so only a module of its own can be tested. Other callback arguments (`account`,
`trigger`, `session`) are not read, as today.

**Sign-in (`user` present):** exactly today's rules (section 2, first bullet), unchanged; a `user` with no email
returns the token unchanged, as today (`auth.ts:55,76`). The one difference: if the sign-in lookup throws, it follows
row 7 below (today the original error propagates). The recheck rows below apply only when `user` is absent.

**Every later read (no `user`):**
| # | Token | Result | Lookup called |
|---|---|---|---|
| 1 | `service === true` | the token unchanged | no |
| 2 | the test admin: `testAdmin.vercelEnv !== 'production'`, `testAdmin.email` and `testAdmin.password` set, and the token's email equals `testAdmin.email` (both normalised with `normalizeEmail`, as `lib/auth/test-admin.ts:36-38` does) | the token unchanged | no |
| 3 | no string `email` | `null` (no session) | no |
| 4 | a row for the email | the token with `role` and `clientSlug` from the row | yes |
| 5 | no row, `@avenuez.com` | the token with `INTERNAL_ANALYST` / `avenue-z` (what sign-in gives) | yes |
| 6 | no row, any other email | `null` (no session) | yes |
| 7 | the lookup throws | logs one line, then throws a new `Error('session recheck failed')` with no `cause` (no session for that request) | yes |

- Rows are checked in order, except that row 3 is checked before row 2, since row 2 needs a string email to normalise
  (`normalizeEmail` trims its argument, `lib/admin/access.ts:3-4`).
- Row 2 re-runs the sign-in environment conditions on every read, with no stored marker: a test admin session stops
  being trusted on production, when either value is unset, or when `TEST_ADMIN_EMAIL` changes. Known limit, DECIDED
  (2026-09-30, round 2's one MAJOR): changing only the password does not revoke a session minted before the change,
  because the token never carries the password (today it is not revoked either). To cut off test admin sessions, change
  `TEST_ADMIN_EMAIL` or unset either value. Preview only. Also on preview: any user whose email equals
  `TEST_ADMIN_EMAIL` is passed through unchanged (not an escalation, since the token is kept as it is, but that user is
  not re-checked).
- Row 5 matches sign-in, so staff without a row (and staff whose row is deleted) keep the default team view, which
  sees every client (`app/dashboard/layout.tsx:17-19`). Known limit, unchanged by design: any `@avenuez.com` Google account
  gets that at sign-in today (`auth.ts:68-70`). A staff row whose role changes does take effect.
- Row 6 is a removed client user. `null` is fail closed. Sign-in gives the same answer since Paul's review (it used to
  give `CLIENT_VIEWER` / null, `auth.ts:71-73`, which the next request then refused); nobody reaches it at sign-in
  anyway: Google sign-in is `@avenuez.com` only (`auth.ts:51`) and the credentials login needs a row
  (`credential-login.ts:30`). Auth.js clears the cookie when sign-in's callback returns `null`.
- Row 7 logs `[auth] session recheck failed: <error name>`: never the email, the token or the message. It throws a
  fresh error with no `cause`, so no detail of the original error reaches Auth.js, which prints a thrown error's stack
  and cause (`@auth/core/errors.js:10-13`, `lib/utils/logger.js:14-19`; `auth.ts` sets no `logger`).
- Only `role` and `clientSlug` change; every other claim is kept.

### 3.2 The service cookie is marked
`mintServiceCookie` adds `service: true` to the token (`lib/auth/service-cookie.ts:19-28`). The token is signed and
encrypted with `AUTH_SECRET`, so the claim cannot be forged without the secret, the same trust as the role it already
carries. The `JWT` type gains `service?: true` (`types/next-auth.d.ts:16-21`).

### 3.3 CLAUDE.md
Both lines (`:102-103`, `:565-566`) change to: role and slug are set at sign-in and re-read from the database on every
request (`getClientByEmail`, once per render), so a removed or moved client user loses the old access on their next
request; staff with no row keep the default `INTERNAL_ANALYST` view.

## 4. Effect
- A removed client user: the next request has no session; the proxy sends them to `/login` (`proxy.ts:9-11`).
- A moved user: the next request carries the new slug, so the old portal is refused by the existing checks.
- A role change (for example `CLIENT_ADMIN` to `CLIENT_VIEWER`, or a new `INTERNAL_ADMIN` row): effective on the next
  request, with no sign-out and sign-in.
- A staff member whose row is deleted keeps the default `INTERNAL_ANALYST` view (row 5, known limit).
- Nobody signs in more often; the 30 days from sign-in is unchanged.
- Cost: one indexed read (`users.email` with its client) per render that calls `auth()`: the proxy, then the page's
  render (its calls share the React cache), plus server actions. About two per page load. UNVERIFIED count; the
  `timed` PERF logs show it once deployed, with `PERF_LOG=1` (`lib/perf.ts:15`).
- Renaissance: its users are re-checked like everyone else; while their rows are unchanged they get exactly today's
  role and slug. Nothing Renaissance renders changes.

## 5. Failure handling
- Database down or slow: the lookup throws, that request has no session and goes to `/login`. The cookie is not
  cleared (nothing saves the clear, section 2), so the next request after recovery works with no new sign-in. The
  exception is a call to `/api/auth/session` during the outage, which does clear it and signs that user out (section 2). Pages
  already read the database on every request, so an outage already breaks them; this adds the login page as the
  landing spot.
- Sessions from before the deploy: real users are simply re-checked (the goal); a preview test admin session keeps
  working, since row 2 checks the environment, not a stored marker. Service cookies are minted fresh every run (1 hour),
  so none predate the deploy and all carry `service`.
- A token with no email cannot come from any sign-in path here; row 3 treats it as no session.

## 6. Edge cases
| # | Case | Expected | Test |
|---|---|---|---|
| 1 | unchanged client user | same role and slug | J1 |
| 2 | role changed in the database | new role on the next read | J2 |
| 3 | moved to another client | new slug on the next read | J3 |
| 4 | removed client user | `null` | J4 |
| 5 | staff with no row, or row deleted | `INTERNAL_ANALYST` / `avenue-z` | J5 |
| 6 | service cookie | unchanged, no lookup | J6, S1 |
| 7 | test admin (preview) | unchanged, no lookup; on production, or with changed `TEST_ADMIN_*`, the lookup path | J7 |
| 8 | lookup throws | rejects with a fresh error, one log line, no email anywhere | J8 |
| 9 | token with no email | `null` | J9 |
| 10 | sign-in paths | today's results, except anyone else with no row gets no session | J10 |
| 11 | other claims | kept | J1 |
| 12 | email in mixed case | the lookup lower-cases (`queries.ts:51`) | existing behaviour |

## 7. Tests (written before the code)
`lib/auth/jwt-callback.test.ts` (new, added to the vitest include list), with a mocked `lookup`:
- J1 a row returns its role and slug; `sub`, `name`, `email` and an extra claim are kept; `lookup` called once with the
  email.
- J2 a token with `CLIENT_ADMIN` and a row with `CLIENT_VIEWER` returns `CLIENT_VIEWER`.
- J3 a token with slug `a` and a row with slug `b` returns `b`.
- J4 no row for `someone@client.test` returns `null`.
- J5 no row for `someone@avenuez.com` returns `INTERNAL_ANALYST` / `avenue-z`.
- J6 `service: true` returns the same token; `lookup` not called.
- J7 the test admin (non-production env, both values set, matching email in another case) returns the same token and
  `lookup` is not called; with `vercelEnv: 'production'`, with a different email, or with the password unset, `lookup`
  is called.
- J8 a `lookup` that rejects with an `Error` whose message contains the email: `jwtCallback` rejects with an error whose
  message is exactly `session recheck failed` and whose `cause` is undefined; `console.error` is called once, and
  neither the thrown error nor any logged argument contains the email. The same for the sign-in path (a `user` whose
  lookup rejects).
- J9 a token with no email returns `null`; `lookup` not called.
- J10 sign-in: the test admin user gives its role and slug with no lookup; a user with a row gives the row;
  `@avenuez.com` with no row gives the default; any other email with no row gives no session (`null`); a `user` with
  no email returns the token unchanged.
`lib/auth/service-cookie-marker.test.ts` (new, not the `service-cookie.test.ts` #281 adds; `// @vitest-environment
node`, as #281's is): S1 a minted cookie decodes with `service: true`.
W1 wiring, in `lib/auth/jwt-callback.test.ts`: `auth.ts` cannot be imported in tests (`vitest.setup.ts` stubs
`@/auth`), so the test reads `auth.ts` as text and asserts its `jwt` callback calls `jwtCallback` and that no
`getClientByEmail(` call remains in it. The plan's local check proves it live (section 8).

## 8. Proving it live (plan, not code)
On staging, after this merges (my call, 2026-09-30): signed in as a test client viewer, remove that user's row, or
change its role, and the next click reflects it with no sign-out; then restore the row. That is a staging write, so it
takes a dry run and my go.

## 9. For Paul specifically
1. Every request instead of hourly, and why hourly cannot work here (section 2).
2. How row-less sessions are left alone: a `service` claim on the minted cookie, and the test admin re-checked
   against its environment on every read.
3. Fail closed per request on a database error, with a fresh error so no email reaches the logs (section 3.1).
4. The CLAUDE.md rule change.
5. Staff keep the default analyst view when their row is deleted (known limit, row 5).
6. A test admin password change does not revoke old preview sessions (known limit, decided; section 3.1, row 2).
7. The sign-in lookup now also throws a fresh error on failure (section 3.1).
8. DECIDED (Paul, 2026-10-01; I agree): how long staff stay signed in. Option (a), as a follow-up PR so it does not
   hold this one up: staff sessions end after about 24 hours and every session has a hard 30-day cap, using a sign-in
   time stored in the token at sign-in (the token's `iat` is reset on every re-encode, section 2). That ties a
   leaver's access back to their Google account, which offboarding already disables. Not the disabled-staff list
   (a schema change plus someone remembering each leaver). Rotating `AUTH_SECRET` stays the emergency stop. The
   `/api/auth/session` 30-day refresh is closed by the same cap. Nothing in this PR changes it.
9. DECIDED (Paul, 2026-10-01; I agree): keep the read on every request, no cache. It is one indexed read, and a
   per-instance cache across many short-lived Vercel instances would save little while delaying a removal by up to a
   minute. Measure on staging with `PERF_LOG=1` after merge, against a bar set before measuring (proposed, for Paul
   and me to confirm): no more than 50 ms added to a page load at p95, and no rise in peak database connections.
   A cache is added only if the measurement misses that bar.

## 10. Other open PRs
- #281 upgrades next-auth; the paths read here are the same in its version (section 2). It adds
  `lib/auth/service-cookie.test.ts` and does not touch `service-cookie.ts`; its test uses `toMatchObject`, so the new
  claim does not break it.
- #287 edits `lib/auth/route-access.ts` and adds `lib/auth/page-access.ts`; this change touches neither, and reads the
  same `session.user.role` / `clientSlug` they do.
- `vitest.config.ts` is also edited by #281, #285 and #287; the new entry goes where none of them edits.

## 11. Out of scope
Changing the 30-day lifetime, a browser-side session refresh, clearing cookies on removal, and #287's own checks.
