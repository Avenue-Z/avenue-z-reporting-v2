# Configurable Dashboard — Sub-project #2: Persistence — Design

**Status:** Approved (brainstorm)
**Date:** 2026-06-18
**Branch:** `feat/configurable-dashboard-rnd`
**Parent design:** `2026-06-17-configurable-dashboard-design.md` (this is sub-project #2 of 5)
**Builds on:** sub-project #1 (`lib/dashboard/` resolution layer — `BlockConfig`, `resolveBlock`)

---

## 1. Summary

Persist a single, per-client **configurable dashboard**: an ordered set of
Metric Blocks plus a dashboard-level default time range. Storage is a new
nullable JSONB column on `clients` (consistent with the four existing config
columns). A hand-rolled validator guards the untyped JSON on read and write. A
role-gated server action saves the config; a query helper reads it.

This sub-project is **persistence only** — no UI, no natural-language authoring,
no rendering. Those are sub-projects #3 and #4. The save action exists but
nothing calls it yet.

---

## 2. Key decisions (from brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Storage | A 5th nullable JSONB column `dashboard_config` on `clients` | One small shared dashboard per client; matches `paidSearchConfig`/`prConfig`/etc. A separate `dashboard_blocks` table would be over-engineering |
| Ownership | Per-client, shared (one dashboard per client) | Locked in #1 |
| Validation | Hand-rolled `parseDashboardConfig` (no new dependency) | Repo has no validation lib; mirrors #1's discriminated-result style; reusable by #4 |
| Edit permission | `INTERNAL_ADMIN` (any client) **or** `CLIENT_ADMIN` (own client only) | Consistent with the roles table (`INTERNAL_ANALYST` is read-only; `CLIENT_ADMIN` has full access to its own client) |
| View permission | Anyone with access to the client | Inherits existing route protection |
| Migration | `db:generate` + commit the SQL; do **not** auto-run `db:migrate` | Applying mutates the shared Neon DB — the human's call |

---

## 3. Storage shape & types

New column on `clients` (`lib/db/schema.ts`):

```ts
dashboardConfig: jsonb('dashboard_config').$type<DashboardConfig>()  // nullable; null = not configured
```

Types live in `lib/dashboard/types.ts` (dashboard domain) and are imported into
`schema.ts` for the `$type<>` annotation:

```ts
interface DashboardConfig {
  defaultRange: { dateRange: string; compareRange: string | null } // the global control's default
  blocks: PersistedBlock[]                                         // array order = display order
}

type PersistedBlock = BlockConfig & { layout?: { w?: number; h?: number } }
```

`PersistedBlock` is exactly #1's `BlockConfig` plus an optional `layout`, so a
stored block feeds straight into
`resolveBlock(block, config.defaultRange, { slug })` when #3 renders — no
transformation. `layout` stays minimal/optional now; #3 owns the real grid and
can widen it later (cheap: JSONB + a hand-rolled validator, no migration).

Adding a nullable column is a backward-compatible migration (existing rows →
`NULL`).

---

## 4. Validation (`lib/dashboard/persistence.ts`)

Pure, dependency-free, unit-tested. Imports only types (no `db`), so the test
runs env-free.

```ts
parseDashboardConfig(json: unknown):
  | { ok: true; config: DashboardConfig }
  | { ok: false; error: string }

parseBlockConfig(json: unknown):
  | { ok: true; block: PersistedBlock }
  | { ok: false; error: string }
```

Rules:

- **Top level:** an object with a valid `defaultRange` (`{ dateRange: string;
  compareRange: string | null }`) and a `blocks` **array**. Empty `blocks: []`
  is **valid** (a freshly-created empty dashboard).
- **Each block** (`parseBlockConfig`): `id` and `name` non-empty strings;
  `format` ∈ `'currency' | 'percent' | 'count' | 'number'`; `range` is `null`
  or `{ dateRange: string; compareRange: string | null }`; optional `layout` is
  absent or `{ w?: number; h?: number }`; and a valid `binding`:
  - `source: 'supermetrics'` → `dsId`, `metricField`, `account` non-empty
    strings; optional `expectedAccounts` (string array) and `filters` (string).
  - `source: 'triplewhale'` → `metric` non-empty string; optional `account`.
  - `source: 'aggregate'` → `op` ∈ `'+' | '-' | '*' | '/'`, and `left`/`right`
    each a valid **leaf** binding (supermetrics or triplewhale — not nested
    aggregates, matching #1's single-binary-op model).
- Returns a precise `error` string naming the first failure (e.g.
  `"blocks[2].binding.op: expected one of +,-,*,/"`).

---

## 5. Read & write path

### Read — `getDashboardConfig` (`lib/db/queries.ts`)

```ts
getDashboardConfig(slug: string): Promise<DashboardConfig | null>
```

Reads `client.dashboardConfig` via the existing `getClientBySlug`, runs
`parseDashboardConfig`. Returns the validated config, or `null` when the column
is empty **or invalid** — a corrupt/legacy row degrades to "no dashboard,"
never crashes the page. Wrapped in `timed('db', 'getDashboardConfig', …)` like
the existing helpers.

### Write — `saveDashboardConfig` (`app/actions/dashboard.ts`, server action)

```ts
'use server'
saveDashboardConfig(slug: string, config: DashboardConfig):
  Promise<{ ok: true } | { ok: false; error: string }>
```

Flow:

1. `auth()` → resolve session (role, `clientSlug`).
2. **Permission check:** allow if `role === 'INTERNAL_ADMIN'`, or
   (`role === 'CLIENT_ADMIN'` and `session.clientSlug === slug`). Otherwise
   return `{ ok: false, error: 'forbidden' }`.
3. `parseDashboardConfig(config)` → reject invalid before writing.
4. `db.update(clients).set({ dashboardConfig: config, updatedAt: new Date() })
   .where(eq(clients.slug, slug))`.
5. `revalidatePath` for the client's dashboard route.
6. Return `{ ok: true }`.

---

## 6. Migration

1. Add the column to `lib/db/schema.ts`.
2. `npm run db:generate` → new `drizzle/00XX_*.sql`
   (`ALTER TABLE "clients" ADD COLUMN "dashboard_config" jsonb;`) + updated
   `drizzle/meta` snapshot. `generate` is offline (diffs schema vs. snapshot;
   no DB connection). Commit both.
3. **Do not** run `db:migrate` as part of implementation — applying mutates the
   shared Neon DB. Flag it for the human to apply when ready. The column is
   nullable, so application is backward-compatible.

---

## 7. Testing

- **`lib/dashboard/persistence.test.ts`** (pure, env-free, `tsx` + `node:assert`
  convention): valid full config; empty `blocks: []` (valid); missing/invalid
  `defaultRange`; bad `format`; each binding variant valid + invalid; bad
  aggregate `op`; aggregate with a nested-aggregate operand rejected;
  round-trip of a config containing one supermetrics, one triplewhale, and one
  aggregate block.
- **Thin I/O wrappers** (`getDashboardConfig`, `saveDashboardConfig`) touch
  `db`/`auth`; per repo convention they are not unit-tested in isolation and
  are exercised when #3 wires the UI.

---

## 8. Out of scope (later sub-projects)

The grid/Metric-Block UI, the global time-range control, drag-and-drop, the save
button, NL authoring + preview card (#4), aggregate cross-source formulas at the
UI level (#5), and rendering stored blocks via `resolveBlock` (#3). Seeding a
sample dashboard for Renaissance is deferred to #3 (or a one-off manual insert).

---

## 9. Files

```
lib/dashboard/types.ts          # + DashboardConfig, PersistedBlock (extend existing file)
lib/dashboard/persistence.ts    # parseDashboardConfig, parseBlockConfig
lib/dashboard/persistence.test.ts
lib/db/schema.ts                # + dashboardConfig column; import DashboardConfig type
lib/db/queries.ts               # + getDashboardConfig
app/actions/dashboard.ts        # + saveDashboardConfig server action
drizzle/00XX_*.sql + meta       # generated migration (committed, not applied)
```

---

## 10. Open items / notes

- **Apply the migration:** `npm run db:migrate` against Neon is a manual step the
  human runs after review.
- **`layout` shape** is intentionally minimal in #2; #3 finalizes grid
  coordinates and widens `parseBlockConfig`'s `layout` check accordingly.
- `parseBlockConfig` is written to be **reusable by #4** to validate
  NL-resolved configs before preview/save.
