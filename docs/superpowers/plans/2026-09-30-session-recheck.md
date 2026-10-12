# Check each login against the database on every request, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A removed or moved client user loses their old access on their next request; nobody signs in more often.

**Architecture:** The `jwt` callback moves out of `auth.ts` into `lib/auth/jwt-callback.ts`. On sign-in it keeps
today's rules. On every later session read it re-reads the role and slug with `getClientByEmail`, skipping the minted
service cookie (a new `service: true` claim) and the preview test admin (its environment re-checked each read).

**Tech Stack:** Next.js 16, Auth.js v5 (next-auth 5.0.0-beta.30), TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-30-session-recheck-design.md` (reviewed twice; it wins where this plan
differs; J1 to J10, S1, W1 are its section 7).

## Global Constraints
- Sign-in results are today's, byte for byte (`auth.ts:54-77`); the only sign-in difference is the fresh error when
  its lookup throws.
- No email, token or error message in any log line or thrown error from the callback.
- `vitest.config.ts`: the new entries go after `'lib/linkedin/kpis.dash.test.ts',`, a line #281, #285 and #287 do not
  touch (they edit around lines 26 and 51 to 56).
- Do not touch `lib/auth/route-access.ts`, `lib/auth/page-access.ts` (#287) or `lib/auth/service-cookie.test.ts`
  (#281 adds it).
- No dash characters outside code. Checks: `DATABASE_URL=postgresql://ci:ci@db.invalid/ci make check`.

## Review Focus
1. A database error at any point, sign-in or later, never puts the email in a log (J8).
2. The cache warmer, health sweep and lock sweep keep `INTERNAL_ADMIN` (J6, S1).
3. The preview test admin keeps working and loses trust on production or a changed email (J7).
4. A removed client user gets no session (J4); a staff member with no row keeps the default view (J5).
5. `auth.ts` really calls the new function (W1).

---

### Task 1: `jwtCallback` and its tests

**Files:** Create `lib/auth/jwt-callback.ts`, `lib/auth/jwt-callback.test.ts`; modify `vitest.config.ts`.

- [ ] Step 1: write J1 to J10 and W1 in `lib/auth/jwt-callback.test.ts` (spec section 7), with a `vi.fn()` lookup and
  `console.error` spied. W1 reads `auth.ts` with `readFileSync` and asserts it contains `jwtCallback(` and no
  `getClientByEmail(user.email)`.
- [ ] Step 2: add the file to `vitest.config.ts`; run it; expect FAIL (module missing).
- [ ] Step 3: write `lib/auth/jwt-callback.ts`:
  - exports `jwtCallback({ token, user }, { lookup, testAdmin })`, `Lookup`, `TestAdminEnv`;
  - sign-in (`user` present): no email returns the token; `user.role` set gives that role and slug with no lookup;
    else the lookup, then the `@avenuez.com` default, then `CLIENT_VIEWER` / null (today's constants move here);
  - later reads: `service === true` returns the token; no string email returns null; the test admin (not production,
    both values set, `normalizeEmail` equal) returns the token; else the lookup: a row sets role and slug, no row with
    `@avenuez.com` sets the default, else null;
  - every lookup goes through one helper that catches, logs `[auth] session recheck failed: <error name>` and throws
    `new Error('session recheck failed')`.
- [ ] Step 4: run the file; J1 to J10 PASS; W1 still FAILS (auth.ts not wired yet).
- [ ] Step 5: commit.

### Task 2: wire `auth.ts`, mark the service cookie, type the claim, update CLAUDE.md

**Files:** Modify `auth.ts:9-11,54-77`, `lib/auth/service-cookie.ts:19-28`, `types/next-auth.d.ts:16-21`,
`CLAUDE.md:102-103,565-566`; create `lib/auth/service-cookie-marker.test.ts`; modify `vitest.config.ts`.

- [ ] Step 1: write S1 (`// @vitest-environment node`): a minted cookie decodes with `service: true`. Run; FAIL.
- [ ] Step 2: add `service: true` to the minted token; add `service?: true` to the `JWT` type. Run S1; PASS.
- [ ] Step 3: `auth.ts`: `jwt: ({ token, user }) => jwtCallback({ token, user }, { lookup: getClientByEmail,
  testAdmin: { email: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD, vercelEnv:
  process.env.VERCEL_ENV } })`; drop the two constants now unused there. Run W1; PASS.
- [ ] Step 4: CLAUDE.md, both lines, per spec 3.3.
- [ ] Step 5: run `lib/auth/`; commit.

### Task 3: prove it and hand it over
- [ ] `make check` passes; eslint on changed files is clean.
- [ ] Merge proof against every open PR (#281 to #287, #291, #292), pairs both orders and all together; tests on the
  tree merged with #281 (the next-auth upgrade) and #287 (the auth checks).
- [ ] Line-by-line check of the code against spec 3.1 to 3.3 (no drift).
- [ ] Draft PR flagging spec section 9 for Paul. The live check on the local app (spec section 8) waits on my go (a
  dev write).
