# CLAUDE.md — `lib/dashboard/` (configurable dashboard engine)

**Read [ENGINEERS.md](./ENGINEERS.md) first** for the architecture (blocks →
bindings → resolvers → adapters → UI, caching, sharing). This file is the terse
rule list for working in the engine.

## Rules

1. **[types.ts](./types.ts) is the source of truth** for the config model. When you
   add or change a binding kind or `BlockConfig` field there, update
   **[persistence.ts](./persistence.ts) `parseDashboardConfig` in the same commit** —
   it is the only runtime validation. Types are not enforced at runtime.

2. **Adapters (`adapters/*.ts`) are the only layer that touches a data source.**
   Resolvers, blocks, and UI go through the registry / `resolveBlock`; never call
   `smQuery` / Triple Whale / Shopify clients directly from elsewhere in the feature.

3. **Never put a raw API key in a cache key.** Hash it with `keyHash` (SHA-256,
   first 16 hex). Cache keys must include source id + account + metric +
   dim/granularity + ISO range + serialized filter so nothing collides across
   clients or ranges.

4. **A failed leaf must never throw to the page.** Map errors to a `BlockError` via
   [errors.ts](./errors.ts) `mapError`; add new source errors there, not with ad-hoc
   `catch` blocks.

5. **`header` / `narrative` blocks carry a `__static__` sentinel binding** and must
   never reach a real resolver — `resolveBlock` guards this; keep it that way.

6. **`dimensions` is length exactly 1 (v1)** for grouped/series bindings. Enforce in
   the parser and re-check against the per-source safe-column regex in the adapter.

7. **Composites (`aggregate`/`calculated`/`formula`) are KPI-only.** Grouped/series
   resolution rejects them with `invalid-metric`. Don't try to give them a breakdown.

8. **Every mutating/discovery server action gates with `canEditDashboard`**
   ([permissions.ts](./permissions.ts)) server-side. Adding an action? Add the gate.

9. **Engine tests are standalone `tsx` scripts, run individually.** This engine is
   **not** in the Vitest include globs (those cover only `lib/report-sections`,
   `app/actions`, `components/report-sections`), so `npm test` does **not** run it.
   Mirror the convention: a sibling `<file>.test.ts` with
   `// Run: npx tsx lib/dashboard/<file>.test.ts`, `node:assert`, one descriptive
   comment header per case; run it by hand. Add/extend tests for any behavior change.

10. **Formula and Shopify bindings are manual-only** — there is no NL proposer path;
    `proposeBlock` rejects them server-side.
