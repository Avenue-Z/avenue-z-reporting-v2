# Configurable Dashboard — Design

**Status:** Approved (brainstorm) — R&D
**Date:** 2026-06-17
**Branch:** `feat/configurable-dashboard-rnd`
**Source PRD:** "PRD: Configurable Dashboard" (Draft v1, 2026-06-17)

---

## 1. Summary

A configurable analytics dashboard for the paid-media area. Non-technical users
assemble **Metric Blocks** by describing what they want in natural language.
Blocks pull live data, support cross-platform aggregation, and respond to a
global time-range + comparison control that each block can override.

This is a **full PRD build**, decomposed into five sub-projects, each with its
own spec → plan → implementation cycle. This document covers the **overall
architecture** and the **detailed design for sub-project #1** (the runtime data
resolution layer). Sub-projects #2–#5 get their own specs as we reach them.

---

## 2. Key decisions (locked in brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Effort shape | Full PRD build, decomposed into 5 sub-projects | Deliver the whole PRD, but in dependency order with review gates |
| Supermetrics connection | **Glean** (has Supermetrics MCP access) — **authoring time only** | LLM-in-the-loop is right for one-time, human-confirmed NL resolution |
| Runtime data fetch | **Direct REST** (existing `awQuery`) — **deterministic** | No LLM in the twice-daily refresh loop → no value drift/hallucination |
| TripleWhale | **Typed stub** behind the source-adapter interface this cycle | No TW creds/catalog in repo yet; slots in later behind the same contract |
| Ownership / scope | **Per-client, shared** | Matches the platform's existing client-scoped report model |
| Permission model (v1) | Derived from existing roles: internal (admin/analyst) **edits**, client users **view** | Reuses Auth.js role/clientSlug already in the JWT |

### Architecture: two-phase model

```
AUTHORING (once, human-confirmed)          RUNTIME (twice daily, deterministic)
─────────────────────────────────         ──────────────────────────────────
NL prompt ──▶ Glean (Supermetrics MCP      stored structured config
             field/account discovery)              │
                    │                              ▼
             proposed structured config    ┌─ SourceAdapter (interface) ─┐
                    │                       │  • supermetrics → awQuery   │ (real)
             preview card / confirm         │  • triplewhale  → REST      │ (stub)
                    │                       │  • aggregate    → formula   │
             store structured config ──────▶└─────────────────────────────┘
                                                   │
                                            value + comparison + format ──▶ Metric Block UI
```

The **structured config is the contract** between the two phases. Glean never
participates at runtime; the refresh loop is pure REST.

---

## 3. Decomposition & build order

Each sub-project is built and reviewed before the next begins.

| # | Sub-project | Touches | Glean? | Real data? |
|---|---|---|---|---|
| **1** | **Block config contract + runtime resolution layer** (`lib/dashboard/`) | lib only | No | Supermetrics ✅, TW stub |
| 2 | Persistence — per-client `dashboard_config`, block ordering, inherit-vs-override | DB / schema | No | — |
| 3 | Dashboard shell + Metric Block UI — grid, drag-drop, global time-range control + per-block override + detach badge | components | No | uses #1 |
| 4 | NL resolution + disambiguation — Glean call from TS, editable preview card, clarifying-question path | lib + UI | **Yes** | — |
| 5 | Aggregate blocks — cross-source NL formula → structured operands | lib + UI | Yes | TW stub |

Building #1 first means a deterministic, fully-tested data engine exists before
any UI or LLM work, and it follows the existing `lib/paid-search/` pattern.

---

## 4. Sub-project #1 — `lib/dashboard/` detailed design

**Goal:** turn a *stored structured block config* into a rendered metric value +
comparison, deterministically. No Glean, no NL, no UI, no persistence wiring.

### 4.1 The structured config (the contract)

```ts
type MetricFormat = 'currency' | 'percent' | 'count' | 'number'

interface SupermetricsBinding { source: 'supermetrics'; dsId: string; metricField: string; account: string; filters?: string }
interface TripleWhaleBinding  { source: 'triplewhale';  metric: string; account?: string }
type LeafBinding = SupermetricsBinding | TripleWhaleBinding

// aggregate = single binary op over two leaf operands (nesting / multi-term deferred)
interface AggregateBinding { source: 'aggregate'; left: LeafBinding; op: '+' | '-' | '*' | '/'; right: LeafBinding }

type Binding = LeafBinding | AggregateBinding

interface BlockConfig {
  id: string
  name: string                                                       // "Blended ROAS"
  binding: Binding
  format: MetricFormat
  range: { dateRange: string; compareRange: string | null } | null   // null = inherit global
}
```

`dateRange` / `compareRange` reuse the existing string formats consumed by
`parseDateRange` / `deriveCompareRange` (preset keys, `custom:...`, and
`previous_period` / `previous_year` / `null`).

### 4.2 Source-adapter interface

```ts
interface SourceAdapter {
  resolveLeaf(
    b: LeafBinding,
    ctx: { slug: string },
    dateRange: string,
    compareRange: string | null,
  ): Promise<{ value: number; prevValue?: number }>
}
```

- **supermetrics** — wraps `awQuery(slug, [metricField], dateRange)` and sums the
  field across rows via a pure, unit-tested `sumMetric(rows, field)`. Comparison
  uses the existing `resolveCompareIso(dateRange, compareRange)`.
- **triplewhale** — typed **stub**: deterministic fake values keyed off the
  metric id (marked `// TODO: real TW API`). Returns `prevValue` only when a
  compare range is active.
- **aggregate** — resolves `left` and `right` through their leaf adapters at the
  *same* active range, then applies `op` (PRD §4: recompute operands, re-apply
  formula). The aggregate's `prevValue` is the formula applied to the operands'
  `prevValue`s. Divide-by-zero (and missing operand) → `no-data`, never a crash.

### 4.3 Resolver output (discriminated — drives UI states)

```ts
type ResolveResult =
  | { ok: true; value: number; prevValue?: number; delta?: number; format: MetricFormat; formatted: string }
  | { ok: false; error: 'disconnected' | 'invalid-metric' | 'no-data' | 'rate-limited' | 'error' }
```

Top-level entry point:

```ts
resolveBlock(
  config: BlockConfig,
  global: { dateRange: string; compareRange: string | null },
  ctx: { slug: string },
): Promise<ResolveResult>
```

- **Range selection:** `config.range ?? global` (per-block override vs. inherit).
- **Delta:** `((cur - prev) / prev) * 100`; `undefined` when `prev` is null/0
  (reuses the existing `delta()` rule from `lib/paid-search/kpis.ts`).
- **No comparison:** when the active `compareRange` is null, `prevValue` and
  `delta` are both absent (PRD §4: hide the delta, do not show zero).
- **Error mapping** (covers the four PRD §7 states):
  - missing creds / config → `disconnected`
  - `SmTimeoutError` → `rate-limited`
  - empty result rows → `no-data`
  - `SmQueryError` → `invalid-metric`
  - anything else → `error`
- **Formatting:** `formatMetric(value, format)` in `lib/dashboard/format.ts`
  (USD via integer `$` formatting, `%` to one decimal, count/number with
  thousands separators), consistent with `lib/paid-search/base.ts` helpers.

### 4.4 Files

```
lib/dashboard/
  types.ts                  # BlockConfig, bindings, MetricFormat, ResolveResult
  format.ts                 # formatMetric()
  delta.ts                  # computeDelta()
  adapters/
    supermetrics.ts         # sumMetric() + supermetrics adapter (wraps awQuery)
    triplewhale.ts          # deterministic stub adapter
  aggregate.ts              # binary-op resolution over two leaf operands
  resolve.ts                # resolveBlock() — range selection, error mapping, formatting
  *.test.ts                 # colocated tests (tsx style, no API calls)
```

### 4.5 Testing

Follow the existing `tsx` test convention
(`npx tsx --env-file=.env.local lib/dashboard/<file>.test.ts`), pure functions
only — no live API calls in tests:

- `sumMetric` — sums a metric field across mocked rows; ignores blanks.
- `computeDelta` — positive, negative, zero-prev (→ undefined), undefined-prev.
- `formatMetric` — currency / percent / count / number.
- `aggregate` — ratio, sum, and divide-by-zero → `no-data`.
- `triplewhale` stub — deterministic output for a given metric id.
- `resolveBlock` — inherit-vs-override range selection; no-comparison hides
  delta; error mapping for each error class.

### 4.6 Explicitly out of scope for #1

Glean, NL parsing, the editable preview card, the real TripleWhale API,
drag-and-drop, the global time-range control UI, and persistence. The resolver
takes a `BlockConfig` object; *where that object is stored* is sub-project #2.

---

## 5. Open questions (carried from PRD, resolved as we reach them)

- **Refresh times** for the twice-daily policy + whether a manual refresh is
  offered. (Relevant to #2/#3; runtime resolver in #1 is schedule-agnostic.)
- **Glean-from-TypeScript** transport: HTTP call to Glean's API vs. a small
  Python sidecar (our `glean-chat-client` tooling is Python). Decided in #4.
- **Confidence threshold** for the clarifying-question path vs. preview card. (#4)
- **Aggregate formula errors** beyond divide-by-zero (missing operand,
  incompatible units). #1 handles divide-by-zero → `no-data`; richer surfacing
  in #5.
- **TripleWhale** real API: auth, metric catalog, rate limits. When TW creds
  land, the stub adapter is replaced behind the same `SourceAdapter` contract.

---

## 6. Notes

- When sub-project #4 introduces the Glean call, the `glean-first-llm` and
  `glean-chat-client` skills govern that code (Glean-first decision already made;
  these route the implementation).
- Pre-existing uncommitted paid-search edits were carried onto this branch from
  the prior branch and are unrelated to this work.
