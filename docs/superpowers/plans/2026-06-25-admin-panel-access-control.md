# Admin Panel & Client Access Control — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Avenue Z internal admins set a per-client shared password, assign one external `CLIENT_ADMIN`, and cap seats per client; let that external admin invite up to the cap of `CLIENT_VIEWER` teammates (each scoped to only their client's portal) via a copy-able login link — while closing the existing no-password login hole.

**Architecture:** Reuse the existing role model (`client_role` enum) and route guards (`app/dashboard/layout.tsx`, `app/portal/[clientSlug]/layout.tsx`). Add two additive columns to `clients` (`shared_password_hash`, `max_seats`). Real credential validation moves into `auth.ts` via bcrypt. Two thin server-action + UI surfaces are added (internal "Manage Access", external "Team"). Seat-cap is enforced with a single atomic conditional `INSERT` (the neon-http driver has no interactive transactions).

**Tech Stack:** Next.js 16 (App Router, RSC + server actions), Auth.js v5 (NextAuth), Drizzle ORM on `drizzle-orm/neon-http` (Neon Postgres), bcryptjs, Tailwind v4, TypeScript strict.

## Global Constraints

- All work stays on branch `repo-admin-panel`. **Open a PR only — never merge to `main`.**
- **Never run a migration against the production database.** Produce the migration file; Thomas applies it (Neon branch first, then prod).
- **Only DB change allowed:** two additive columns on `clients`: `shared_password_hash text` (nullable) and `max_seats integer NOT NULL DEFAULT 5`. No drops, no type changes. The pending `users.demo_mode` drop stays out of this PR and must remain pending (snapshot keeps `demo_mode`).
- **DB driver is `drizzle-orm/neon-http` — NO `db.transaction()`.** Race-safe writes use a single atomic SQL statement.
- **No test framework is installed.** Tests are plain files run with `npx tsx <file>.test.ts` using `node:assert`. Only *pure* logic gets automated tests; DB/UI is verified by `npx tsc --noEmit` and a manual checklist against a Neon branch.
- **This workspace has NO `.env.local` and NO database.** `lib/db/client.ts` throws on import when `DATABASE_URL` is unset, so any module that imports it cannot be executed here. Implementers must verify with `npx tsc --noEmit` and `npm run lint` ONLY. **Do NOT run `npm run build`, `npm run db:migrate`, `npm run db:seed`, `db:studio`, or any `npx tsx` file that transitively imports `lib/db/client.ts`.** `npm run db:generate` and `npx drizzle-kit check` are offline (diff schema vs snapshots) and ARE allowed. `npm run build` and live DB verification are Thomas's manual steps in the runbook.
- **Pure test files must not import the DB client.** A `*.test.ts` may only import modules whose transitive imports exclude `lib/db/client.ts` (keep pure logic in its own module).
- **Fail closed:** a client with no `shared_password_hash` cannot have any client-side user log in.
- **Emails are lowercased on every write and lookup.**
- **Credentials login is for client-side roles only** (`CLIENT_ADMIN`, `CLIENT_VIEWER`). Internal users (`INTERNAL_*`) sign in with Google, unchanged.
- Server actions re-derive the session server-side and check **both** role **and** client ownership before mutating. Never trust a slug/id from the client.
- Commit after every task with a `feat:`/`fix:`/`chore:` message ending in the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.

---

### Task 1: Password hashing helper

**Files:**
- Modify: `package.json` (add `bcryptjs` + `@types/bcryptjs`)
- Create: `lib/auth/password.ts`
- Test: `lib/auth/password.test.ts`

**Interfaces:**
- Produces: `hashPassword(plain: string): Promise<string>`, `verifyPassword(plain: string, hash: string): Promise<boolean>`

- [ ] **Step 1: Install bcryptjs**

```bash
npm install bcryptjs && npm install -D @types/bcryptjs
```

- [ ] **Step 2: Write the failing test**

Create `lib/auth/password.test.ts`:

```ts
/** Run with: npx tsx lib/auth/password.test.ts */
import { strict as assert } from 'node:assert'
import { hashPassword, verifyPassword } from './password'

const hash = await hashPassword('hunter2')
assert.ok(hash.startsWith('$2'), 'bcrypt hash should start with $2')
assert.notEqual(hash, 'hunter2', 'must not store plaintext')
assert.equal(await verifyPassword('hunter2', hash), true, 'correct password verifies')
assert.equal(await verifyPassword('wrong', hash), false, 'wrong password rejected')
assert.equal(await verifyPassword('hunter2', ''), false, 'empty hash rejected')
console.log('password.test.ts PASS')
```

- [ ] **Step 3: Run it, verify it fails**

Run: `npx tsx lib/auth/password.test.ts`
Expected: FAIL — `Cannot find module './password'`.

- [ ] **Step 4: Implement**

Create `lib/auth/password.ts`:

```ts
import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 12

/** Hash a plaintext shared password for storage in clients.shared_password_hash. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS)
}

/** Constant-time compare. Returns false for an empty/missing hash (fail closed). */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false
  return bcrypt.compare(plain, hash)
}
```

- [ ] **Step 5: Run it, verify it passes**

Run: `npx tsx lib/auth/password.test.ts`
Expected: `password.test.ts PASS`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/auth/password.ts lib/auth/password.test.ts
git commit -m "feat: add bcrypt password hashing helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Schema columns + isolated additive migration (the careful DB task)

**Files:**
- Modify: `lib/db/schema.ts` (add `integer` import; add two columns to `clients`)
- Create: `drizzle/0011_<name>.sql` (drizzle-generated, then hand-trimmed)
- Modify: `drizzle/meta/_journal.json`, `drizzle/meta/0011_snapshot.json` (generated, then re-add `demo_mode`)

**Interfaces:**
- Produces: `Client.sharedPasswordHash: string | null`, `Client.maxSeats: number` (via `$inferSelect`)

- [ ] **Step 1: Add the columns to the schema**

In `lib/db/schema.ts`, line 1, add `integer` to the import:

```ts
import { pgTable, uuid, text, jsonb, timestamp, pgEnum, index, integer } from 'drizzle-orm/pg-core'
```

In the `clients` table definition, immediately after the `hiddenReports` line and before `createdAt`, add:

```ts
  sharedPasswordHash: text('shared_password_hash'),
  maxSeats: integer('max_seats').notNull().default(5),
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: creates `drizzle/0011_*.sql` and `drizzle/meta/0011_snapshot.json`, updates `_journal.json`. The generated `.sql` will contain the two `ADD COLUMN`s **and** an unwanted `ALTER TABLE "users" DROP COLUMN "demo_mode";` (because `schema.ts` no longer declares `demoMode` but the prior snapshot still had it).

- [ ] **Step 3: Trim the SQL to the two additive columns only (and make them idempotent)**

Open the generated `drizzle/0011_*.sql`. Replace its entire contents with exactly:

```sql
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "shared_password_hash" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "max_seats" integer DEFAULT 5 NOT NULL;
```

Delete the `DROP COLUMN "demo_mode"` line. The `IF NOT EXISTS` makes a manual re-run safe.

- [ ] **Step 4: Keep `demo_mode` in the snapshot (preserve the pending drop, prevent drift)**

In the generated `drizzle/meta/0011_snapshot.json`, find `tables["public.users"].columns`. Drizzle removed `demo_mode` from it. Re-add it verbatim (copy from `drizzle/meta/0010_snapshot.json`) so the snapshot matches the real DB and the future demo_mode drop still auto-generates:

```json
"demo_mode": {
  "name": "demo_mode",
  "type": "boolean",
  "primaryKey": false,
  "notNull": true,
  "default": false
}
```

Leave the new `clients` columns (`shared_password_hash`, `max_seats`) exactly as drizzle generated them in this snapshot.

- [ ] **Step 5: Verify migration consistency and that nothing else changed**

```bash
npx drizzle-kit check
git diff --stat drizzle/
```

Expected: `drizzle-kit check` reports no consistency errors. The `git diff` touches only the new `0011_*.sql`, `0011_snapshot.json`, and `_journal.json`. Open the `.sql` and confirm it is **exactly the two `ADD COLUMN IF NOT EXISTS` lines** — no `DROP`.

- [ ] **Step 6: Confirm the app types picked up the columns**

Run: `npx tsc --noEmit`
Expected: PASS (no errors). `Client` now has `sharedPasswordHash` and `maxSeats`.

- [ ] **Step 7: Commit (do NOT apply to any DB)**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat: add clients.shared_password_hash and clients.max_seats (additive migration)

Hand-trimmed so the migration only adds the two columns; users.demo_mode
drop stays pending (kept in snapshot). Not applied to any database here.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Pure access-control helpers (seat math, email, role checks)

**Files:**
- Create: `lib/admin/access.ts`
- Test: `lib/admin/access.test.ts`

**Interfaces:**
- Produces:
  - `normalizeEmail(raw: string): string`
  - `isValidEmail(raw: string): boolean`
  - `CLIENT_ROLES: readonly ['CLIENT_ADMIN', 'CLIENT_VIEWER']`
  - `isClientRole(role: string): boolean`
  - `seatsRemaining(currentCount: number, maxSeats: number): number`

- [ ] **Step 1: Write the failing test**

Create `lib/admin/access.test.ts`:

```ts
/** Run with: npx tsx lib/admin/access.test.ts */
import { strict as assert } from 'node:assert'
import { normalizeEmail, isValidEmail, isClientRole, seatsRemaining } from './access'

assert.equal(normalizeEmail('  Foo@Bar.COM '), 'foo@bar.com')
assert.equal(isValidEmail('foo@bar.com'), true)
assert.equal(isValidEmail('nope'), false)
assert.equal(isValidEmail(''), false)
assert.equal(isClientRole('CLIENT_VIEWER'), true)
assert.equal(isClientRole('CLIENT_ADMIN'), true)
assert.equal(isClientRole('INTERNAL_ADMIN'), false)
assert.equal(seatsRemaining(5, 5), 0)
assert.equal(seatsRemaining(3, 5), 2)
assert.equal(seatsRemaining(6, 5), 0, 'never negative')
console.log('access.test.ts PASS')
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx tsx lib/admin/access.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/admin/access.ts`:

```ts
export const CLIENT_ROLES = ['CLIENT_ADMIN', 'CLIENT_VIEWER'] as const

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

// Deliberately simple: one @, non-empty local and domain, a dot in the domain.
export function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim())
}

export function isClientRole(role: string): boolean {
  return (CLIENT_ROLES as readonly string[]).includes(role)
}

export function seatsRemaining(currentCount: number, maxSeats: number): number {
  return Math.max(0, maxSeats - currentCount)
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx tsx lib/admin/access.test.ts`
Expected: `access.test.ts PASS`.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/access.ts lib/admin/access.test.ts
git commit -m "feat: pure access-control helpers (email, role, seat math)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Real credential validation in auth.ts

**Files:**
- Create: `lib/auth/credential-login.ts`
- Test: `lib/auth/credential-login.test.ts`
- Modify: `lib/db/queries.ts` (add `getUserAuthRecord`)
- Modify: `auth.ts` (Credentials `authorize`)

**Interfaces:**
- Consumes: `verifyPassword` (Task 1), `isClientRole`, `normalizeEmail` (Task 3)
- Produces:
  - `getUserAuthRecord(email): Promise<{ email: string; role: ClientRole; clientId: string; slug: string; sharedPasswordHash: string | null } | null>`
  - `evaluateCredentialLogin(args): Promise<{ id: string; email: string; name: string } | null>` where
    `args = { email: string; password: string; record: AuthRecord | null; verify: (p: string, h: string) => Promise<boolean> }`

- [ ] **Step 1: Write the failing test for the pure decision function**

Create `lib/auth/credential-login.test.ts`:

```ts
/** Run with: npx tsx lib/auth/credential-login.test.ts */
import { strict as assert } from 'node:assert'
import { evaluateCredentialLogin } from './credential-login'

const yes = async () => true
const no = async () => false

const viewer = {
  email: 'team@client.com', role: 'CLIENT_VIEWER' as const,
  clientId: 'c1', slug: 'client', sharedPasswordHash: '$2hash',
}

// happy path
assert.deepEqual(
  await evaluateCredentialLogin({ email: 'team@client.com', password: 'pw', record: viewer, verify: yes }),
  { id: 'team@client.com', email: 'team@client.com', name: 'team' },
)
// wrong password
assert.equal(await evaluateCredentialLogin({ email: 'team@client.com', password: 'x', record: viewer, verify: no }), null)
// unknown user
assert.equal(await evaluateCredentialLogin({ email: 'team@client.com', password: 'pw', record: null, verify: yes }), null)
// client has no shared password set -> fail closed
assert.equal(await evaluateCredentialLogin({ email: 'a@b.com', password: 'pw', record: { ...viewer, sharedPasswordHash: null }, verify: yes }), null)
// internal role must NOT use credentials
assert.equal(await evaluateCredentialLogin({ email: 'a@b.com', password: 'pw', record: { ...viewer, role: 'INTERNAL_ADMIN' as any }, verify: yes }), null)
// missing inputs
assert.equal(await evaluateCredentialLogin({ email: '', password: 'pw', record: viewer, verify: yes }), null)
assert.equal(await evaluateCredentialLogin({ email: 'team@client.com', password: '', record: viewer, verify: yes }), null)
console.log('credential-login.test.ts PASS')
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx tsx lib/auth/credential-login.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure decision function**

Create `lib/auth/credential-login.ts`:

```ts
import { isClientRole, normalizeEmail } from '@/lib/admin/access'

export interface AuthRecord {
  email: string
  role: string
  clientId: string
  slug: string
  sharedPasswordHash: string | null
}

interface Args {
  email: string
  password: string
  record: AuthRecord | null
  verify: (plain: string, hash: string) => Promise<boolean>
}

/**
 * Decide whether a credentials login succeeds. Pure: all I/O is injected.
 * Returns the NextAuth user object on success, or null on any failure.
 * Fails closed: no record, non-client role, missing shared password, or
 * mismatch all return null.
 */
export async function evaluateCredentialLogin(
  args: Args,
): Promise<{ id: string; email: string; name: string } | null> {
  const email = normalizeEmail(args.email ?? '')
  if (!email || !args.password) return null
  const { record } = args
  if (!record) return null
  if (!isClientRole(record.role)) return null          // internal users use Google
  if (!record.sharedPasswordHash) return null           // fail closed
  const ok = await args.verify(args.password, record.sharedPasswordHash)
  if (!ok) return null
  return { id: record.email, email: record.email, name: record.email.split('@')[0] }
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx tsx lib/auth/credential-login.test.ts`
Expected: `credential-login.test.ts PASS`.

- [ ] **Step 5: Add the DB lookup that feeds it**

In `lib/db/queries.ts`, add after `getClientByEmail` (it must return the client id + shared password hash, which `getClientByEmail` does not):

```ts
/**
 * Auth-time lookup: the user's role + their client's slug, id, and shared
 * password hash. Not cached — runs only on sign-in. Returns null if unknown.
 */
export async function getUserAuthRecord(email: string): Promise<{
  email: string
  role: ClientRole
  clientId: string
  slug: string
  sharedPasswordHash: string | null
} | null> {
  const row = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
    with: { client: true },
  })
  if (!row) return null
  return {
    email: row.email,
    role: row.role,
    clientId: row.clientId,
    slug: row.client.slug,
    sharedPasswordHash: row.client.sharedPasswordHash,
  }
}
```

- [ ] **Step 6: Wire it into `auth.ts`**

In `auth.ts`, add imports at the top:

```ts
import { getClientByEmail, getUserAuthRecord } from '@/lib/db/queries'
import { evaluateCredentialLogin } from '@/lib/auth/credential-login'
import { verifyPassword } from '@/lib/auth/password'
```

Replace the entire `Credentials({ ... })` block's `authorize` (currently `auth.ts:25-35`) with:

```ts
      async authorize(credentials) {
        const email = credentials?.email as string | undefined
        const password = credentials?.password as string | undefined
        if (!email || !password) return null
        const record = await getUserAuthRecord(email)
        return evaluateCredentialLogin({ email, password, record, verify: verifyPassword })
      },
```

(Leave the `Google` provider, `signIn`, `jwt`, and `session` callbacks unchanged. `getClientByEmail` stays imported for the `jwt` callback.)

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/auth/credential-login.ts lib/auth/credential-login.test.ts lib/db/queries.ts auth.ts
git commit -m "feat: validate client logins against per-client shared password

Replaces the no-password stub: credentials login now requires a client-side
role and bcrypt-matching the client's shared_password_hash. Fails closed.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Close the remaining auth holes (Preview Access, dead demo login, broken logout)

**Files:**
- Modify: `app/login/page.tsx` (delete the "Preview Access" form)
- Modify: `components/layout/portal-sidebar.tsx` (logout → real `signOutAction`)
- Delete: `app/actions/demo-auth.ts`

**Interfaces:**
- Consumes: `signOutAction` from `app/actions/auth.ts` (already exists)

- [ ] **Step 1: Remove the public Preview Access door**

In `app/login/page.tsx`, delete the entire block at lines 75–85 (the comment `{/* One-click preview access for teammates */}` and the `<form action={signInWithCredentials}>` containing the hidden `demo@avenuez.com` / `demo` inputs and the "Preview Access" button).

- [ ] **Step 2: Fix portal logout to end the real session**

In `components/layout/portal-sidebar.tsx`:
- Line 7: change `import { demoLogout } from '@/app/actions/demo-auth'` to `import { signOutAction } from '@/app/actions/auth'`.
- Line 347: change `<form action={demoLogout}>` to `<form action={signOutAction}>`.

- [ ] **Step 3: Delete the dead demo-auth module**

```bash
git rm app/actions/demo-auth.ts
```

(Its `demoLoginInternal`/`demoLoginClient` are imported nowhere; `demoLogout` was the only used export and is now replaced.)

- [ ] **Step 4: Verify nothing else references demo-auth**

Run: `grep -rn "demo-auth\|demoLogout\|demoLoginInternal\|demoLoginClient\|Preview Access" app components lib --include='*.ts' --include='*.tsx'`
Expected: no matches.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/login/page.tsx components/layout/portal-sidebar.tsx
git commit -m "fix: remove public Preview Access login, fix portal logout, drop dead demo-auth

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Admin DB queries (seat-safe writes)

**Files:**
- Create: `lib/db/seat-result.ts` (pure — no DB import — so its test runs without env)
- Create: `lib/db/admin-queries.ts`
- Test: `lib/db/seat-result.test.ts` (pure result-shape helper only)

**Interfaces:**
- Consumes: `db` (`lib/db/client.ts`), `clients`/`users` (`lib/db/schema.ts`), `sql`/`eq`/`and` (`drizzle-orm`), `revalidateTag` (`next/cache`)
- Produces:
  - `interpretAddResult(r: { insertedRows: number; duplicate: boolean }): { ok: boolean; reason?: 'seat_limit' | 'duplicate' }` (pure, in `lib/db/seat-result.ts`, tested; re-exported from `admin-queries.ts`)
  - `getClientAccessOverview(slug): Promise<{ clientId: string; slug: string; name: string; maxSeats: number; hasPassword: boolean; users: { id: string; email: string; role: ClientRole }[] } | null>`
  - `setClientSharedPassword(clientId: string, hash: string): Promise<void>`
  - `setClientMaxSeats(clientId: string, maxSeats: number): Promise<{ ok: boolean; reason?: 'below_current_count' }>`
  - `addClientUser(args: { clientId: string; email: string; role: 'CLIENT_ADMIN' | 'CLIENT_VIEWER' }): Promise<{ ok: boolean; reason?: 'seat_limit' | 'duplicate' }>`
  - `removeClientUser(args: { clientId: string; userId: string }): Promise<{ ok: boolean; reason?: 'not_found' }>`

- [ ] **Step 1: Write the failing test for the pure result interpreter**

Create `lib/db/seat-result.test.ts`:

```ts
/** Run with: npx tsx lib/db/seat-result.test.ts */
import { strict as assert } from 'node:assert'
import { interpretAddResult } from './seat-result'

// One row inserted -> success.
assert.deepEqual(interpretAddResult({ insertedRows: 1, duplicate: false }), { ok: true })
// Zero rows + the email already exists -> duplicate.
assert.deepEqual(interpretAddResult({ insertedRows: 0, duplicate: true }), { ok: false, reason: 'duplicate' })
// Zero rows, not a duplicate -> seat limit hit.
assert.deepEqual(interpretAddResult({ insertedRows: 0, duplicate: false }), { ok: false, reason: 'seat_limit' })
console.log('seat-result.test.ts PASS')
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx tsx lib/db/seat-result.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3a: Implement the pure interpreter (no DB import)**

Create `lib/db/seat-result.ts`:

```ts
/** Pure: turn the atomic-insert outcome into a typed result. No DB import. */
export function interpretAddResult(r: { insertedRows: number; duplicate: boolean }):
  { ok: boolean; reason?: 'seat_limit' | 'duplicate' } {
  if (r.insertedRows > 0) return { ok: true }
  if (r.duplicate) return { ok: false, reason: 'duplicate' }
  return { ok: false, reason: 'seat_limit' }
}
```

- [ ] **Step 3b: Implement the queries**

Create `lib/db/admin-queries.ts`:

```ts
import { sql, eq, and } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { db } from './client'
import { clients, users, type ClientRole } from './schema'
import { interpretAddResult } from './seat-result'

export { interpretAddResult }

export async function getClientAccessOverview(slug: string) {
  const row = await db.query.clients.findFirst({
    where: eq(clients.slug, slug),
    with: { users: true },
  })
  if (!row) return null
  return {
    clientId: row.id,
    slug: row.slug,
    name: row.name,
    maxSeats: row.maxSeats,
    hasPassword: !!row.sharedPasswordHash,
    users: row.users
      .filter((u) => u.role === 'CLIENT_ADMIN' || u.role === 'CLIENT_VIEWER')
      .map((u) => ({ id: u.id, email: u.email, role: u.role })),
  }
}

export async function setClientSharedPassword(clientId: string, hash: string): Promise<void> {
  await db.update(clients).set({ sharedPasswordHash: hash, updatedAt: new Date() }).where(eq(clients.id, clientId))
  revalidateTag('db')
}

export async function setClientMaxSeats(
  clientId: string,
  maxSeats: number,
): Promise<{ ok: boolean; reason?: 'below_current_count' }> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.clientId, clientId))
  if (maxSeats < count) return { ok: false, reason: 'below_current_count' }
  await db.update(clients).set({ maxSeats, updatedAt: new Date() }).where(eq(clients.id, clientId))
  revalidateTag('db')
  return { ok: true }
}

/**
 * Atomic seat-capped insert. The neon-http driver has no interactive
 * transactions, so the count check and the insert are one statement:
 * the row is inserted only if the client is below max_seats. The unique
 * email constraint distinguishes "duplicate" from "seat limit".
 */
export async function addClientUser(args: {
  clientId: string
  email: string
  role: 'CLIENT_ADMIN' | 'CLIENT_VIEWER'
}): Promise<{ ok: boolean; reason?: 'seat_limit' | 'duplicate' }> {
  const email = args.email.toLowerCase()
  let insertedRows = 0
  let duplicate = false
  try {
    const res = await db.execute(sql`
      INSERT INTO users (email, role, client_id)
      SELECT ${email}, ${args.role}::client_role, ${args.clientId}::uuid
      WHERE (SELECT count(*) FROM users WHERE client_id = ${args.clientId}::uuid)
            < (SELECT max_seats FROM clients WHERE id = ${args.clientId}::uuid)
      RETURNING id
    `)
    // neon-http returns { rows: [...] }; fall back to array shape defensively.
    const rows = (res as { rows?: unknown[] }).rows ?? (res as unknown as unknown[])
    insertedRows = Array.isArray(rows) ? rows.length : 0
  } catch (e) {
    // Unique violation on users.email -> the email is already provisioned somewhere.
    if (e instanceof Error && /unique|duplicate key/i.test(e.message)) duplicate = true
    else throw e
  }
  if (insertedRows > 0) revalidateTag('db')
  return interpretAddResult({ insertedRows, duplicate })
}

export async function removeClientUser(args: {
  clientId: string
  userId: string
}): Promise<{ ok: boolean; reason?: 'not_found' }> {
  const deleted = await db
    .delete(users)
    .where(and(eq(users.id, args.userId), eq(users.clientId, args.clientId)))
    .returning({ id: users.id })
  if (deleted.length === 0) return { ok: false, reason: 'not_found' }
  revalidateTag('db')
  return { ok: true }
}
```

- [ ] **Step 4: Run the pure test, verify it passes**

Run: `npx tsx lib/db/seat-result.test.ts`
Expected: `seat-result.test.ts PASS`. (Do NOT run anything that imports `admin-queries.ts` — it loads the DB client, which throws without env here.)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/db/seat-result.ts lib/db/seat-result.test.ts lib/db/admin-queries.ts
git commit -m "feat: seat-safe admin DB queries (atomic capped insert, no transaction)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Internal admin — "Manage Access" server actions + UI

**Files:**
- Create: `app/actions/client-access.ts`
- Create: `app/dashboard/[clientSlug]/access/page.tsx`
- Create: `app/dashboard/[clientSlug]/access/access-panel.tsx` (client component)
- Modify: `app/dashboard/[clientSlug]/page.tsx` (add a "Manage Access" link in the header)

**Interfaces:**
- Consumes: `auth` (`@/auth`), `hashPassword` (Task 1), `getClientAccessOverview`/`setClientSharedPassword`/`setClientMaxSeats`/`addClientUser` (Task 6), `normalizeEmail`/`isValidEmail` (Task 3)
- Produces (server actions, all gated to `INTERNAL_ADMIN`):
  - `setSharedPasswordAction(slug: string, password: string): Promise<{ ok: boolean; error?: string }>`
  - `setMaxSeatsAction(slug: string, maxSeats: number): Promise<{ ok: boolean; error?: string }>`
  - `assignClientAdminAction(slug: string, email: string): Promise<{ ok: boolean; error?: string }>`

- [ ] **Step 1: Implement the guarded server actions**

Create `app/actions/client-access.ts`:

```ts
'use server'

import { auth } from '@/auth'
import { hashPassword } from '@/lib/auth/password'
import { normalizeEmail, isValidEmail } from '@/lib/admin/access'
import {
  getClientAccessOverview,
  setClientSharedPassword,
  setClientMaxSeats,
  addClientUser,
} from '@/lib/db/admin-queries'

async function requireInternalAdmin() {
  const session = await auth()
  if (!session || session.user.role !== 'INTERNAL_ADMIN') {
    throw new Error('Forbidden')
  }
}

export async function setSharedPasswordAction(slug: string, password: string) {
  await requireInternalAdmin()
  if (!password || password.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' }
  const client = await getClientAccessOverview(slug)
  if (!client) return { ok: false, error: 'Unknown client.' }
  await setClientSharedPassword(client.clientId, await hashPassword(password))
  return { ok: true }
}

export async function setMaxSeatsAction(slug: string, maxSeats: number) {
  await requireInternalAdmin()
  if (!Number.isInteger(maxSeats) || maxSeats < 1 || maxSeats > 100) {
    return { ok: false, error: 'Seat limit must be between 1 and 100.' }
  }
  const client = await getClientAccessOverview(slug)
  if (!client) return { ok: false, error: 'Unknown client.' }
  const res = await setClientMaxSeats(client.clientId, maxSeats)
  if (!res.ok) return { ok: false, error: 'Seat limit is below the current number of users.' }
  return { ok: true }
}

export async function assignClientAdminAction(slug: string, rawEmail: string) {
  await requireInternalAdmin()
  const email = normalizeEmail(rawEmail)
  if (!isValidEmail(email)) return { ok: false, error: 'Enter a valid email.' }
  const client = await getClientAccessOverview(slug)
  if (!client) return { ok: false, error: 'Unknown client.' }
  const res = await addClientUser({ clientId: client.clientId, email, role: 'CLIENT_ADMIN' })
  if (!res.ok) {
    return { ok: false, error: res.reason === 'duplicate' ? 'That email is already assigned to a client.' : 'Seat limit reached — raise it first.' }
  }
  return { ok: true }
}
```

- [ ] **Step 2: Build the client panel**

Create `app/dashboard/[clientSlug]/access/access-panel.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { setSharedPasswordAction, setMaxSeatsAction, assignClientAdminAction } from '@/app/actions/client-access'
import { useRouter } from 'next/navigation'

interface Props {
  slug: string
  hasPassword: boolean
  maxSeats: number
  users: { id: string; email: string; role: string }[]
}

export function AccessPanel({ slug, hasPassword, maxSeats, users }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [seats, setSeats] = useState(maxSeats)
  const [adminEmail, setAdminEmail] = useState('')

  function run(action: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setMsg(null)
    start(async () => {
      const r = await action()
      setMsg(r.ok ? okMsg : (r.error ?? 'Something went wrong.'))
      if (r.ok) router.refresh()
    })
  }

  const inputCls = 'w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-white outline-none focus:border-white/20'
  const btnCls = 'rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-50'

  return (
    <div className="space-y-8">
      {msg && <div className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white">{msg}</div>}

      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">Shared password {hasPassword ? '(set — entering a new one rotates it)' : '(not set yet)'}</h3>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New shared password" className={inputCls} />
        <button disabled={pending} className={btnCls} onClick={() => run(() => setSharedPasswordAction(slug, password), 'Shared password updated.')}>Save password</button>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">Seat limit (currently {users.length}/{maxSeats} used)</h3>
        <input type="number" min={1} max={100} value={seats} onChange={(e) => setSeats(Number(e.target.value))} className={inputCls} />
        <button disabled={pending} className={btnCls} onClick={() => run(() => setMaxSeatsAction(slug, seats), 'Seat limit updated.')}>Save seat limit</button>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">Assign external admin</h3>
        <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@clientcompany.com" className={inputCls} />
        <button disabled={pending} className={btnCls} onClick={() => run(() => assignClientAdminAction(slug, adminEmail), 'External admin assigned.')}>Assign admin</button>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">Current client-side users</h3>
        <ul className="space-y-1.5 text-sm text-white/80">
          {users.length === 0 && <li className="text-text-muted">None yet.</li>}
          {users.map((u) => <li key={u.id}>{u.email} — <span className="text-text-muted">{u.role.replace('_', ' ')}</span></li>)}
        </ul>
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Build the page (server component, gated by the dashboard layout)**

Create `app/dashboard/[clientSlug]/access/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { getClientAccessOverview } from '@/lib/db/admin-queries'
import { AccessPanel } from './access-panel'

export default async function ClientAccessPage({
  params,
}: {
  params: Promise<{ clientSlug: string }>
}) {
  const { clientSlug } = await params
  const overview = await getClientAccessOverview(clientSlug)
  if (!overview) notFound()

  return (
    <>
      <Header title={overview.name} subtitle="Manage Access" />
      <div className="divider-full mb-8" />
      <AccessPanel slug={overview.slug} hasPassword={overview.hasPassword} maxSeats={overview.maxSeats} users={overview.users} />
    </>
  )
}
```

(Route is under `/dashboard`, so `app/dashboard/layout.tsx` already restricts it to `INTERNAL_*`. The server actions independently require `INTERNAL_ADMIN`.)

- [ ] **Step 4: Add the entry point link**

In `app/dashboard/[clientSlug]/page.tsx`, inside the `<Header>` children (after the "Manage Connections" `<Link>`, around line 24), add:

```tsx
        <Link
          href={`/dashboard/${client.slug}/access`}
          className="rounded-[100px] bg-[#3a3a3a] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-bg-subtle"
        >
          Manage Access
        </Link>
```

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS. (Do NOT run `npm run build` — no DB env here; build is Thomas's manual step.)

- [ ] **Step 6: Commit**

```bash
git add app/actions/client-access.ts "app/dashboard/[clientSlug]/access" "app/dashboard/[clientSlug]/page.tsx"
git commit -m "feat: internal admin Manage Access (set password, seat limit, assign external admin)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: External admin — "Team" server actions + UI

**Files:**
- Create: `app/actions/team.ts`
- Create: `app/portal/[clientSlug]/team/page.tsx`
- Create: `app/portal/[clientSlug]/team/team-panel.tsx` (client component)
- Modify: `app/portal/[clientSlug]/layout.tsx` (pass role to sidebar)
- Modify: `components/layout/portal-sidebar.tsx` (accept `userRole`, show Team link for `CLIENT_ADMIN`)

**Interfaces:**
- Consumes: `auth`, `getClientAccessOverview`/`addClientUser`/`removeClientUser` (Task 6), `normalizeEmail`/`isValidEmail` (Task 3)
- Produces (server actions):
  - `inviteTeammateAction(slug: string, email: string): Promise<{ ok: boolean; error?: string; loginUrl?: string }>`
  - `removeTeammateAction(slug: string, userId: string): Promise<{ ok: boolean; error?: string }>`

- [ ] **Step 1: Implement the guarded server actions**

Create `app/actions/team.ts`:

```ts
'use server'

import { auth } from '@/auth'
import { normalizeEmail, isValidEmail } from '@/lib/admin/access'
import { getClientAccessOverview, addClientUser, removeClientUser } from '@/lib/db/admin-queries'

/** Require a CLIENT_ADMIN acting on THEIR OWN client. Returns the clientId. */
async function requireClientAdminOf(slug: string): Promise<string> {
  const session = await auth()
  if (!session || session.user.role !== 'CLIENT_ADMIN' || session.user.clientSlug !== slug) {
    throw new Error('Forbidden')
  }
  const overview = await getClientAccessOverview(slug)
  if (!overview) throw new Error('Unknown client')
  return overview.clientId
}

function loginUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? ''
  return `${base}/login`
}

export async function inviteTeammateAction(slug: string, rawEmail: string) {
  const clientId = await requireClientAdminOf(slug)
  const email = normalizeEmail(rawEmail)
  if (!isValidEmail(email)) return { ok: false, error: 'Enter a valid email.' }
  const res = await addClientUser({ clientId, email, role: 'CLIENT_VIEWER' })
  if (!res.ok) {
    return { ok: false, error: res.reason === 'duplicate' ? 'That email already has access.' : 'You have reached your seat limit. Contact Avenue Z to add more.' }
  }
  return { ok: true, loginUrl: loginUrl() }
}

export async function removeTeammateAction(slug: string, userId: string) {
  const clientId = await requireClientAdminOf(slug)
  const session = await auth()
  // Guard: an admin cannot remove themselves, and cannot remove another admin.
  const overview = await getClientAccessOverview(slug)
  const target = overview?.users.find((u) => u.id === userId)
  if (!target) return { ok: false, error: 'User not found.' }
  if (target.role === 'CLIENT_ADMIN') return { ok: false, error: 'Cannot remove an admin seat.' }
  if (target.email === session?.user.email?.toLowerCase()) return { ok: false, error: 'Cannot remove yourself.' }
  const res = await removeClientUser({ clientId, userId })
  if (!res.ok) return { ok: false, error: 'User not found.' }
  return { ok: true }
}
```

- [ ] **Step 2: Build the Team panel (client component)**

Create `app/portal/[clientSlug]/team/team-panel.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inviteTeammateAction, removeTeammateAction } from '@/app/actions/team'

interface Props {
  slug: string
  maxSeats: number
  selfEmail: string
  users: { id: string; email: string; role: string }[]
}

export function TeamPanel({ slug, maxSeats, selfEmail, users }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)

  const remaining = Math.max(0, maxSeats - users.length)

  function invite() {
    setMsg(null); setLink(null)
    start(async () => {
      const r = await inviteTeammateAction(slug, email)
      if (r.ok) { setMsg(`Invited ${email.trim().toLowerCase()}. Send them this link and the shared password.`); setLink(r.loginUrl ?? null); setEmail(''); router.refresh() }
      else setMsg(r.error ?? 'Something went wrong.')
    })
  }

  function remove(userId: string) {
    setMsg(null); setLink(null)
    start(async () => {
      const r = await removeTeammateAction(slug, userId)
      setMsg(r.ok ? 'Removed.' : (r.error ?? 'Something went wrong.'))
      if (r.ok) router.refresh()
    })
  }

  const inputCls = 'w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-white outline-none focus:border-white/20'

  return (
    <div className="space-y-6">
      <p className="text-sm text-text-muted">{remaining} of {maxSeats} seat{maxSeats !== 1 ? 's' : ''} remaining.</p>

      {msg && <div className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white">{msg}</div>}
      {link && (
        <div className="flex items-center gap-2">
          <input readOnly value={link} className={inputCls} onFocus={(e) => e.currentTarget.select()} />
          <button className="shrink-0 rounded-full border border-white/15 px-4 py-2.5 text-sm font-semibold text-white" onClick={() => navigator.clipboard?.writeText(link)}>Copy link</button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@email.com" className={inputCls} disabled={remaining === 0 || pending} />
        <button disabled={remaining === 0 || pending} className="shrink-0 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black disabled:opacity-50" onClick={invite}>Invite</button>
      </div>

      <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06]">
        {users.map((u) => (
          <li key={u.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-white">{u.email}{u.email === selfEmail ? ' (you)' : ''} <span className="ml-2 text-text-muted">{u.role.replace('_', ' ')}</span></span>
            {u.role !== 'CLIENT_ADMIN' && u.email !== selfEmail && (
              <button disabled={pending} className="text-xs font-semibold text-red-400 hover:text-red-300 disabled:opacity-50" onClick={() => remove(u.id)}>Remove</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: Build the Team page (server component, gated to CLIENT_ADMIN)**

Create `app/portal/[clientSlug]/team/page.tsx`:

```tsx
import { redirect, notFound } from 'next/navigation'
import { auth } from '@/auth'
import { getClientAccessOverview } from '@/lib/db/admin-queries'
import { TeamPanel } from './team-panel'

export default async function TeamPage({
  params,
}: {
  params: Promise<{ clientSlug: string }>
}) {
  const { clientSlug } = await params
  const session = await auth()
  // Only the external admin of THIS client may manage the team.
  if (!session || session.user.role !== 'CLIENT_ADMIN' || session.user.clientSlug !== clientSlug) {
    redirect('/unauthorized')
  }
  const overview = await getClientAccessOverview(clientSlug)
  if (!overview) notFound()

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-white">Team</h1>
      <p className="mb-8 mt-1 text-sm text-text-muted">Invite teammates to view {overview.name}&apos;s reports. They sign in with their email and your shared password.</p>
      <TeamPanel slug={overview.slug} maxSeats={overview.maxSeats} selfEmail={(session.user.email ?? '').toLowerCase()} users={overview.users} />
    </div>
  )
}
```

- [ ] **Step 4: Pass the role into the sidebar**

In `app/portal/[clientSlug]/layout.tsx`, change the `<PortalSidebar clients={clients} />` (line 33) to:

```tsx
        <PortalSidebar clients={clients} userRole={session.user.role} />
```

- [ ] **Step 5: Show the Team link only to the external admin**

In `components/layout/portal-sidebar.tsx`:
- Extend the props interface (line 12):

```tsx
interface PortalSidebarProps {
  clients: Client[]
  userRole?: string
}
```

- Update the signature (line 16): `export function PortalSidebar({ clients, userRole }: PortalSidebarProps) {`
- Add a `Users` icon to the lucide import (line 10): `import { LogOut, Lock, Users } from 'lucide-react'`
- Immediately after the closing `</nav>` (line 343) and before the `{/* Logout */}` block, insert:

```tsx
      {userRole === 'CLIENT_ADMIN' && (
        <div className="border-t border-white/[0.06] px-3 py-2">
          <Link
            href={`/portal/${clientSlug}/team`}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold text-text-muted transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            <Users className="h-4 w-4 shrink-0 opacity-50" />
            Team
          </Link>
        </div>
      )}
```

- [ ] **Step 6: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS. (Do NOT run `npm run build` — no DB env here; build is Thomas's manual step.)

- [ ] **Step 7: Commit**

```bash
git add app/actions/team.ts "app/portal/[clientSlug]/team" "app/portal/[clientSlug]/layout.tsx" components/layout/portal-sidebar.tsx
git commit -m "feat: external admin Team page (invite/remove viewers, copy login link, seat cap)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Final verification, runbook, and PR

**Files:**
- Create: `docs/runbooks/2026-06-25-admin-panel-launch.md`
- Modify: `MIGRATIONS-PENDING.md` (note the new migration is delivered but unapplied)

- [ ] **Step 1: Run all automated tests + full checks**

```bash
npx tsx lib/auth/password.test.ts
npx tsx lib/admin/access.test.ts
npx tsx lib/auth/credential-login.test.ts
npx tsx lib/db/seat-result.test.ts
npx tsc --noEmit
npm run lint
```

Expected: every test prints `PASS`; typecheck and lint succeed. (`npm run build` and live-DB checks are Thomas's manual steps — no DB env in this workspace. The runbook covers them.)

- [ ] **Step 2: Write the launch runbook**

Create `docs/runbooks/2026-06-25-admin-panel-launch.md` with these contents:

```markdown
# Admin Panel Launch Runbook

## 1. Apply the migration (Thomas runs this — never run against prod blind)
- Migration: `drizzle/0011_*.sql` — adds `clients.shared_password_hash` and
  `clients.max_seats` only. Idempotent (`ADD COLUMN IF NOT EXISTS`).
- Recommended: create a Neon branch, set `DATABASE_URL_UNPOOLED` to it, run
  `npm run db:migrate`, verify, then run against prod.
- Verify after: `select column_name from information_schema.columns where
  table_name='clients' and column_name in ('shared_password_hash','max_seats');`
  → two rows. Existing clients show `max_seats = 5`.

## 2. Onboard the first client
1. As an Avenue Z internal admin (Google sign-in), open
   `/dashboard/<clientSlug>/access`.
2. Set the client's **shared password** (≥ 8 chars). Communicate it to the
   client out-of-band (you tell them — the app does not email).
3. Set the **seat limit** if 5 is not right.
4. **Assign external admin**: enter the client contact's email → creates their
   CLIENT_ADMIN seat (counts toward the limit).

## 3. External admin invites their team
1. The external admin signs in at `/login` with their email + the shared
   password, lands in their portal, opens **Team**.
2. They invite teammates by email (up to the seat limit) and send each the
   copied login link + the shared password.

## 4. Verify isolation (do before going live)
- Client A user can reach `/portal/client-a/...` but `/portal/client-b/...`
  redirects to `/unauthorized`.
- Wrong password and unprovisioned emails are rejected at `/login`.
- A removed teammate can no longer sign in.

## Rollback
- The change is additive. To roll back app code, revert the branch; the two
  columns can remain (harmless, nullable / defaulted).
```

- [ ] **Step 3: Update the pending-migrations note**

In `MIGRATIONS-PENDING.md`, append:

```markdown

## Add client access columns (delivered, awaiting apply)

`drizzle/0011_*.sql` adds `clients.shared_password_hash` and
`clients.max_seats` (additive). Delivered on `repo-admin-panel`; apply per
`docs/runbooks/2026-06-25-admin-panel-launch.md`. The `users.demo_mode` drop
above is intentionally still separate and unapplied.
```

- [ ] **Step 4: Commit**

```bash
git add docs/runbooks/2026-06-25-admin-panel-launch.md MIGRATIONS-PENDING.md
git commit -m "docs: admin panel launch runbook + pending-migration note

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 5: Push the branch and open a PR (do NOT merge)**

```bash
git push -u origin repo-admin-panel
gh pr create --base main --head repo-admin-panel \
  --title "Admin panel: internal access management + external team invites" \
  --body "$(cat <<'BODY'
## Summary
- Internal "Manage Access" (set per-client shared password, seat limit, assign external admin)
- External "Team" page (invite/remove viewers up to seat cap, copy-able login link)
- Real per-client shared-password validation in auth.ts (closes the no-password stub)
- Removes the public "Preview Access" login, fixes portal logout, drops dead demo-auth
- Additive migration only: clients.shared_password_hash + clients.max_seats

## Migration
`drizzle/0011_*.sql` is additive and **NOT applied** to any database by this PR.
Apply per docs/runbooks/2026-06-25-admin-panel-launch.md (Neon branch first).
The pending users.demo_mode drop is intentionally left separate.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

Expected: PR opened against `main`. **Do not merge** — Thomas reviews and merges.

---

## Self-Review

**Spec coverage:**
- Internal: set shared password (Task 7), assign external admin (Task 7), editable seat cap (Tasks 6–7). ✓
- External: invite up to cap (Task 8), copy-able link (Task 8), remove (Task 8), scoped to own client (Task 8 guards + existing portal layout). ✓
- Named seats / 5-default cap / configurable (Tasks 2, 6, 7, 8). ✓
- Shared password per client, set by Avenue Z, value later (Task 7). ✓
- Security holes: no-password stub (Task 4), Preview Access (Task 5), portal logout (Task 5). ✓
- Additive migration, demo_mode kept out, not applied to prod (Task 2, Task 9). ✓
- Driver has no transactions → atomic insert (Task 6). ✓
- Invariants: server-side role+ownership checks (Tasks 7–8), fail-closed (Task 4), lowercased emails (Tasks 3,4,6), internal roles unassignable via client actions (Task 8 only inserts CLIENT_VIEWER; Task 7 admin-assign gated to INTERNAL_ADMIN). ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. The migration filename suffix (`*`) is drizzle-assigned at generation and resolved in Task 2 Step 2 — not a placeholder.

**Type consistency:** `getClientAccessOverview` returns `{ clientId, slug, name, maxSeats, hasPassword, users[] }` and is consumed consistently in Tasks 7–8. `addClientUser`/`removeClientUser` result shapes match their callers. `evaluateCredentialLogin` arg/return shapes match the test and the `auth.ts` call site. `Client.sharedPasswordHash`/`Client.maxSeats` (Task 2) are read in Task 6.
