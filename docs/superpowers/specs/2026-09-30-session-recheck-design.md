# Check each login against the database on every request: design

Status: DRAFT for review. Every claim is read on `origin/dev` 8502f40 (2026-09-30), and the Auth.js files in the
installed `next-auth` 5.0.0-beta.30 / `@auth/core` 0.41.0 (this branch's lockfile) and in 5.0.0-beta.32 / 0.41.3 (the
open #281's).

## 1. Why
Paul, reviewing #287 (2026-09-29, `lib/auth/route-access.ts:13`): `role` and `clientSlug` come from the token written at
sign-in, and `auth.ts` sets no session lifetime, so after `removeTeammateAction`, or when a user is moved to another
client, an existing session keeps its old access until it expires. He offered a shorter `maxAge` or a re-check in the
`jwt` callback. I chose the re-check (2026-09-30), on every request (section 2 explains why not hourly), knowing it runs
for every signed-in person, Renaissance's users included (my explicit OK under the Renaissance rule). Paul reviews this
decision specifically (section 9).

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
- So an hourly re-check cannot remember when it last checked (the timestamp would live in a cookie nothing saves): after
  the first hour it would check on every request anyway. Checking on every request is the same cost, simpler, and
  takes effect on the next click.
- The lookup: `getClientByEmail` reads `users` by lower-cased email with its client (`lib/db/queries.ts:49-56`),
  wrapped in React `cache` (one read per render) and `timed` for PERF logs (`:58`). Not persistently cached, so a
  removed row is gone on the next read.
- Sessions with no user row, which the re-check must not demote:
  - the service cookie for the cache warmer and the health sweep: minted with `INTERNAL_ADMIN` / `avenue-z` for
    `cache-warm@avenuez.com` and `health-sweep@avenuez.com` (`lib/auth/service-cookie.ts:13-29`,
    `lib/cache-warm/run.ts:74`, `app/api/health/sweep/route.ts:59`), 1 hour, one per run;
  - the preview-only test admin: `INTERNAL_ADMIN` / `avenue-z` from `evaluateTestAdminLogin`
    (`lib/auth/test-admin.ts:30-41`), never on production (`:34`).
  The credentials login returns no role (`lib/auth/credential-login.ts:35`), so it always takes the lookup path.
- CLAUDE.md states the old rule twice: "no DB hit on subsequent requests" (`CLAUDE.md:102-103`) and "no DB hit per
  request" (`:565-566`).

## 3. The change

### 3.1 `jwtCallback` moves to `lib/auth/jwt-callback.ts` (new), and `auth.ts` calls it
`jwtCallback({ token, user }, lookup)` returns `Promise<JWT | null>`, where `lookup` is
`(email: string) => Promise<{ role: string; slug: string } | null>`; `auth.ts` passes `getClientByEmail`. It lives
outside `auth.ts` because `vitest.setup.ts` stubs `@/auth`, so only a module of its own can be tested.

**Sign-in (`user` with an email present):** exactly today's rules (section 2, first bullet), with one addition: the
test admin's token also gets `fixed: true`.

**Every later read (no `user`):**
| # | Token | Result | Lookup called |
|---|---|---|---|
| 1 | `service === true` | the token unchanged | no |
| 2 | `fixed === true` | the token unchanged | no |
| 3 | no string `email` | `null` (no session) | no |
| 4 | a row for the email | the token with `role` and `clientSlug` from the row | yes |
| 5 | no row, `@avenuez.com` | the token with `INTERNAL_ANALYST` / `avenue-z` (what sign-in gives) | yes |
| 6 | no row, any other email | `null` (no session) | yes |
| 7 | the lookup throws | logs one line, then rethrows (no session for that request) | yes |

- Row 5 matches sign-in, so staff without a row (and staff whose row is deleted) keep the default team view.
- Row 6 is a removed client user. Sign-in would give `CLIENT_VIEWER` / null (`auth.ts:71-73`), but nobody reaches that
  at sign-in any more: Google sign-in is `@avenuez.com` only (`auth.ts:51`) and the credentials login needs a row
  (`credential-login.ts:30`). `null` is fail closed.
- Row 7 logs `[auth] session recheck failed: <error name>`: never the email, the token or the message.
- Only `role` and `clientSlug` change; every other claim is kept.

### 3.2 The service cookie is marked
`mintServiceCookie` adds `service: true` to the token (`lib/auth/service-cookie.ts:19-28`). The token is signed and
encrypted with `AUTH_SECRET`, so the claim cannot be forged without the secret, the same trust as the role it already
carries.

### 3.3 CLAUDE.md
Both lines (`:102-103`, `:565-566`) change to: role and slug are set at sign-in and re-read from the database on every
request (`getClientByEmail`, once per render), so a removed or moved user loses the old access on their next request.

## 4. Effect
- A removed client user: the next request has no session; the proxy sends them to `/login` (`proxy.ts:9-11`).
- A moved user: the next request carries the new slug, so the old portal is refused by the existing checks.
- A role change (for example `CLIENT_ADMIN` to `CLIENT_VIEWER`, or a new `INTERNAL_ADMIN` row): effective on the next
  request, with no sign-out and sign-in.
- Nobody signs in more often; the 30 days from sign-in is unchanged.
- Cost: one indexed read (`users.email` with its client) per render that calls `auth()`: the proxy, then the page's
  render (its calls share the React cache), plus server actions. About two per page load. UNVERIFIED count; the
  `timed` PERF logs show it once deployed.
- Renaissance: its users are re-checked like everyone else; while their rows are unchanged they get exactly today's
  role and slug. Nothing Renaissance renders changes.

## 5. Failure handling
- Database down or slow: the lookup throws, that request has no session and goes to `/login`. The cookie is not
  cleared (nothing saves the clear, section 2), so the next request after recovery works with no new sign-in. Pages
  already read the database on every request, so an outage already breaks them; this adds the login page as the
  landing spot.
- Sessions from before the deploy carry no `service` or `fixed` marker: real users are simply re-checked (the goal);
  a preview test admin session from before the deploy is demoted to `INTERNAL_ANALYST` until it signs in again (preview
  only; production has no test admin). Service cookies are minted fresh every run (1 hour), so none predate the deploy.
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
| 7 | test admin (preview) | unchanged, no lookup; sign-in sets `fixed` | J7, J10 |
| 8 | lookup throws | rejects, one log line with no email | J8 |
| 9 | token with no email | `null` | J9 |
| 10 | sign-in paths | today's four results | J10 |
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
- J7 `fixed: true` returns the same token; `lookup` not called.
- J8 a throwing `lookup` rejects; `console.error` called once with a line containing `session recheck failed` and not
  the email.
- J9 a token with no email returns `null`; `lookup` not called.
- J10 sign-in: the test admin user gives its role, slug and `fixed: true` with no lookup; a user with a row gives the
  row; `@avenuez.com` with no row gives the default; any other email with no row gives `CLIENT_VIEWER` / null.
`lib/auth/service-cookie-marker.test.ts` (new, not #281's `service-cookie.test.ts`): S1 a minted cookie decodes with
`service: true`.
Wiring: `auth.ts` cannot be imported in tests (`vitest.setup.ts` stubs `@/auth`); `tsc` checks the call, and the plan's
local check proves it live (section 8).

## 8. Proving it live (plan, not code)
On the local app (dev database), signed in as a test client viewer: remove that user's row, or change its role, and the
next click reflects it with no sign-out. That is a dev write, so it waits on my go.

## 9. For Paul specifically
1. Every request instead of hourly, and why hourly cannot work here (section 2).
2. The two skip markers (`service`, `fixed`) as the way to leave row-less sessions alone.
3. Fail closed per request on a database error (section 5).
4. The CLAUDE.md rule change.

## 10. Other open PRs
- #281 upgrades next-auth; the paths read here are the same in its version (section 2). It edits
  `lib/auth/service-cookie.test.ts`, not `service-cookie.ts`; its test uses `toMatchObject`, so the new claim does not
  break it.
- #287 edits `lib/auth/route-access.ts` and adds `lib/auth/page-access.ts`; this change touches neither, and reads the
  same `session.user.role` / `clientSlug` they do.
- `vitest.config.ts` is also edited by #281, #285 and #287; the new entry goes where none of them edits.

## 11. Out of scope
Changing the 30-day lifetime, a browser-side session refresh, clearing cookies on removal, and #287's own checks.
