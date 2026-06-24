# Multi-Value (IN/OR) Dimension Filters — Design

**Date:** 2026-06-23
**Status:** Approved (pending spec review)
**Relates to:** the Supermetrics dimension filters feature
(`2026-06-23-supermetrics-dimension-filters-design.md`) and its persisted
value cache. Those made a single dimension value filterable; this lets one
filter match **several** values.

## Goal

Let one filter row match **multiple** values for a dimension — e.g.
`channel ∈ {google-ads, facebook-ads, applovin, snapchat-ads}` — so the Kind
Patches "Platform Spend" block (four paid channels, excluding TikTok) is
buildable. Today every filter is a single equality (`col == value`,
AND-combined).

## Semantics

**OR within a row, AND across rows.** One filter row = one column matching
*any* of its selected values. Multiple filter rows still combine with `AND`.
Example: `channel ∈ {google-ads, facebook-ads}` **AND** `country == US`.

## Decision: data model

Change the filter shape from `{ column: string; value: string }` to
**`{ column: string; values: string[] }`** in both `SupermetricsBinding` and
`TripleWhaleBinding`. A single-value filter is just a one-element array.

Rejected alternatives:
- Keep `value` and add optional `values?` — two shapes coexist, conditionals
  spread through the parser, both adapters, and the UI.
- Add an `op: '==' | 'in'` discriminator — stringly-typed, more surface area.

**Backward compatibility:** the persistence parser accepts the legacy
`{ column, value: string }` and normalizes it to `{ column, values: [value] }`,
so already-saved dashboards keep working with no data migration.

## Architecture / components

### 1. Types — `lib/dashboard/types.ts` (MODIFY)
```ts
filters?: { column: string; values: string[] }[]
```
on both `SupermetricsBinding` and `TripleWhaleBinding`. Comment: "OR within a
row (any value), AND across rows."

### 2. SM adapter — `lib/dashboard/adapters/supermetrics.ts` (`buildSmFilter`, MODIFY)
Build one clause per row, joined by ` AND `:
- drop rows whose column fails `SM_COLUMN_RE` or whose `values` (after dropping
  empty strings) is empty;
- one value → `col == v`;
- many values → `(col == v1 OR col == v2 OR …)`.

Reuses the already-verified `==` / `OR` / parens grammar (values unquoted, as
today) — no dependency on SM's native `[]` in-list syntax, which keeps risk
low. Returns `undefined` when nothing remains.

### 3. TripleWhale builder — `lib/triplewhale/queries.ts` (`buildMetricSql` + `TwFilter`, MODIFY)
- `TwFilter` becomes `{ column: string; values: string[] }`.
- Per row (column checked with `isSafeColumn`, else `TwQueryError`; values
  escaped with `escapeSqlValue`, dropping empties):
  - one value → `AND col = 'v'`;
  - many → `AND col IN ('v1', 'v2', …)`;
  - empty after cleaning → row skipped.

`lib/dashboard/adapters/triplewhale.ts` only passes `b.filters` through — no
logic change, just the new type flows in.

### 4. Persistence parser — `lib/dashboard/persistence.ts` (`parseLeaf`, MODIFY)
For each filter entry under both `supermetrics` and `triplewhale` branches:
- accept `{ column: non-empty string, values: string[] (all strings) }`;
- **legacy:** accept `{ column: non-empty string, value: string }` and
  normalize to `{ column, values: [value] }`;
- otherwise error `${path}.filters: expected {column, values}[]`.

Factor the per-entry parse into a small local helper used by both branches
(they share identical filter logic today — DRY the duplication while here).

### 5. Draft → binding — `components/dashboard/add-block/build-config.ts` (MODIFY)
- `LeafDraft` filter fields become `{ column: string; values: string[] }[]`.
- `leafToBinding` cleaning: keep rows where `column !== ''` **and** at least one
  non-empty value; within a kept row, drop empty-string values.

### 6. UI — `components/dashboard/add-block/leaf-builder.tsx` (`SmFilterRow`, `TwFilterRow`, MODIFY)
The value selector becomes **multi-select**:
- selected values render as removable chips;
- SM cached-dropdown and TW dropdown become multi-select pick lists;
- SM free-text path (uncached / "Load values") allows typing a value and
  adding it as a chip (Enter or an add affordance);
- the dimension picker and the `getSmDimensionValues` / "Load values" flow are
  unchanged (values are per-column, independent of single vs multi).
- `onChange` now emits `{ column, values }`.

### 7. Multi-select combobox — `components/dashboard/add-block/multi-select-combobox.tsx` (NEW)
A small popover multi-select (chips + checkable options + optional free-text
add), mirroring `SearchCombobox`'s styling and `ComboOption` type. Kept
separate so the single-select `SearchCombobox` (used for metric/account/
dimension pickers) is untouched.

### 8. NL resolvers — `lib/dashboard/nl/resolve.ts` (and aggregate path if it
emits leaf filters) (MODIFY, type alignment only)
Wherever a resolver constructs a leaf `filters` entry, emit
`{ column, values: [value] }` instead of `{ column, value }` so the produced
`BlockConfig` matches the new binding type (otherwise `tsc` breaks).
Multi-value *generation* from NL is **out of scope** — resolvers keep emitting
single-value arrays.

## Out of scope (v1)
- NL/AI generating multi-value filters (manual builder is the target).
- SM native `[]` in-list operator (OR-of-equalities used instead).
- Numeric/range operators (`>`, `<`, `between`) — equality/in-list only.

## Data flow
Build a block → add a filter row → pick dimension → pick *one or more* values
(chips). On save, `leafToBinding` cleans them into `{ column, values }`. At
resolve time, `buildSmFilter` / `buildMetricSql` expand each row to
OR-of-equalities (SM) or `=`/`IN` (TW). Existing single-value saved blocks load
via the legacy parser normalization.

## Error / empty states
- Row with no column or no non-empty value → dropped at binding and at build
  time (never emitted to the API).
- Unsafe column → SM: dropped; TW: `TwQueryError` (unchanged behavior).
- Discovery failure for values → existing free-text fallback still applies.

## Testing
Pure-unit (`tsx` + `node:assert`), matching repo convention:
- `buildSmFilter`: undefined/empty; 1 value → `col == v`; N values →
  `(col == v1 OR col == v2)`; multi-row → joined by ` AND `; unsafe column and
  empty values dropped.
- `buildMetricSql`: 1 value → `= 'v'`; N values → `IN ('v1', 'v2')`; escaping;
  unsafe column throws; empty values dropped.
- `parseLeaf` / `parseDashboardConfig`: accepts `{column, values}`; normalizes
  legacy `{column, value}`; rejects malformed.
UI (`leaf-builder`, the new multi-select), `build-config`, and the NL type
alignment are verified by `tsc --noEmit` + `npm run build`, consistent with how
components are handled in this repo.

## Global constraints
- TypeScript strict; no `any` in new/changed code.
- All SM/TW calls remain server-side only; UI changes are client-only.
- SQL/filter safety unchanged: SM column `SM_COLUMN_RE`; TW `isSafeColumn` +
  `escapeSqlValue` on every value.
- Backward compatible: legacy `{column, value}` persisted filters still load.
- No new npm dependency.

## File structure
```
lib/dashboard/
  types.ts                       # MODIFY: filters -> {column, values:[]}
  persistence.ts                 # MODIFY: parseLeaf accepts values[]; legacy normalize
  adapters/supermetrics.ts       # MODIFY: buildSmFilter OR-expansion
lib/triplewhale/
  queries.ts                     # MODIFY: TwFilter + buildMetricSql =/IN
lib/dashboard/nl/
  resolve.ts                     # MODIFY: emit {column, values:[value]}
components/dashboard/add-block/
  build-config.ts                # MODIFY: LeafDraft filters + leafToBinding cleaning
  leaf-builder.tsx               # MODIFY: SmFilterRow/TwFilterRow multi-select
  multi-select-combobox.tsx      # NEW: chips multi-select picker
```
