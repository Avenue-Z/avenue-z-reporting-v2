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
             proposed structured config    ┌─ resolveBlock ──────────────────┐
                    │                       │  leaf registry (LeafAdapter):    │
             preview card / confirm         │   • supermetrics → awQuery (real)│
                    │                       │   • triplewhale  → REST  (stub)  │
             store structured config ──────▶│  aggregate orchestrator:         │
                                            │   • left/right via leaves+formula│
                                            └──────────────────────────────────┘
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

interface SupermetricsBinding {
  source: 'supermetrics'
  dsId: string
  metricField: string
  account: string
  expectedAccounts?: string[]   // drift guard: runtime asserts returned accounts ⊆ this set → invalid-metric on drift (see §5)
  filters?: string              // opaque passthrough to awQuery — NOT validated or diffable in v1
}
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

### 4.2 Resolution contract (two levels — leaves vs. orchestrator)

Leaf sources and aggregates are **not peers**. Leaf sources implement
`LeafAdapter` and are registered in a map keyed by `source`. Aggregate is an
**orchestrator** that delegates to leaf adapters — it does *not* implement
`LeafAdapter`.

```ts
interface LeafAdapter {
  resolveLeaf(
    b: LeafBinding,
    ctx: { slug: string },
    dateRange: string,
    compareRange: string | null,
  ): Promise<{ value: number; prevValue?: number }>
}

// registry, keyed by LeafBinding['source']
const leafAdapters: Record<'supermetrics' | 'triplewhale', LeafAdapter>
```

**Leaf adapters:**

- **supermetrics** — wraps `awQuery(slug, [metricField], dateRange)` and sums the
  field across rows via a pure, unit-tested `sumMetric(rows, field)`. Comparison
  uses the existing `resolveCompareIso(dateRange, compareRange)`. **Drift guard:**
  when `expectedAccounts` is present, asserts the returned account set ⊆
  `expectedAccounts`; on mismatch throws → mapped to `invalid-metric` (see §5).
- **triplewhale** — typed **stub**: deterministic fake values keyed off the
  metric id (marked `// TODO: real TW API`). Returns `prevValue` only when a
  compare range is active.

**Aggregate orchestrator** (separate function, not a `LeafAdapter`):

```ts
resolveAggregate(b: AggregateBinding, ctx, dateRange, compareRange):
  Promise<{ value: number; prevValue?: number }>
```

Resolves `left` and `right` through the leaf registry at the **same** active
range, then applies `op` (PRD §4: recompute operands, re-apply formula).

- **`prevValue` invariant:** both operands resolve at the *same* range, so each
  operand's `prevValue` is present iff a comparison is active. The aggregate's
  `prevValue` is therefore the formula applied to both operands' `prevValue`s,
  present iff comparison is active — never a mix of present/absent.
- **Divide-by-zero** (and missing operand) → surfaced as `no-data`, never a crash.
- **Operand error precedence:** when a leaf operand fails, the aggregate adopts
  that error. When *both* fail, precedence is, highest-wins:
  `disconnected` > `invalid-metric` > `rate-limited` > `no-data` > `error`.
  This precedence is explicit and tested so the result is deterministic
  regardless of which promise settles first.

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
- **Delta:** `((cur - prev) / prev) * 100`; `undefined` when `prev` is null/0.
  The `delta()` rule currently lives as a *private* local in
  `lib/paid-search/kpis.ts` (not exported). To avoid both a bad
  `dashboard → paid-search` dependency and a duplicated source of truth, the rule
  is extracted to a neutral shared module `lib/metrics.ts` (`computeDelta`);
  dashboard imports it. Migrating `paid-search` to the shared util is tracked as a
  follow-up (not done in #1, to keep the change surgical).
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
- **Formatting ownership:** the resolver is the single owner of presentation —
  it emits `formatted` (and `delta`). The Metric Block UI (#3) is a **dumb
  renderer**: it displays `formatted` and uses the sign of `delta` for
  direction/color, and re-derives nothing. No formatting logic is split across
  layers.
- **format vs. binding:** the contract permits nonsensical pairings (e.g. a
  `/` ratio like ROAS tagged `currency` → "$2" for 2.0x). Format validity
  against the binding is enforced at **authoring time** (#4, the preview card);
  the runtime resolver **trusts** the stored `format` and adds no guard (YAGNI
  for #1).

### 4.4 Files

```
lib/
  metrics.ts                # computeDelta() — neutral shared util (canonical source of the rule)
  dashboard/
    types.ts                # BlockConfig, bindings, MetricFormat, LeafAdapter, ResolveResult
    format.ts               # formatMetric()
    adapters/
      supermetrics.ts       # sumMetric() + supermetrics LeafAdapter (wraps awQuery, drift guard)
      triplewhale.ts        # deterministic stub LeafAdapter
    aggregate.ts            # resolveAggregate() — orchestrator over two leaf operands + error precedence
    resolve.ts              # resolveBlock() — range selection, leaf registry, error mapping, formatting
    *.test.ts               # colocated tests (tsx style, no API calls)
```

### 4.5 Testing

Follow the existing `tsx` test convention, pure functions only — **no live API
calls and no `.env` loading** (run `npx tsx lib/dashboard/<file>.test.ts`; the
absence of `--env-file` is deliberate — these tests must not depend on creds, so
a test that quietly hits the network can't pass locally):

- `sumMetric` — sums a metric field across mocked rows; ignores blanks; drift
  guard rejects an account outside `expectedAccounts`.
- `computeDelta` — positive, negative, zero-prev (→ undefined), undefined-prev.
- `formatMetric` — currency / percent / count / number.
- `aggregate` — ratio, sum, and divide-by-zero → `no-data`.
- `aggregate` **error precedence** — when both operands fail, the higher-priority
  error wins (`disconnected` > `invalid-metric` > `rate-limited` > `no-data` >
  `error`), asserted independent of settle order.
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
  land, the stub adapter is replaced behind the same `LeafAdapter` contract.
- **Runtime drift detection (raised in review, flagged loud):** the stored
  binding must hold enough to detect that a runtime fetch no longer matches what
  the authoring-time preview confirmed. #1 adds `expectedAccounts` as the first
  guard (returned accounts ⊆ confirmed set → `invalid-metric` on drift). Still
  open for #2/persistence: detecting upstream field renames/splits and currency
  denomination changes, so a query that *silently succeeds on the wrong rows*
  is caught rather than summed. Widening the contract is cheap now and expensive
  once configs are stored in the wild — decide the full set of stored guards
  before #2 persists any config.
- **Shared `computeDelta` migration:** `paid-search` still has its private
  `delta()` after #1; migrating it to `lib/metrics.ts` is a tracked follow-up to
  remove the duplicate rule.
- **format-vs-binding validation** lives at authoring (#4); confirm the preview
  card rejects nonsensical pairings (e.g. ratio tagged `currency`).

---

## 6. Notes

- When sub-project #4 introduces the Glean call, the `glean-first-llm` and
  `glean-chat-client` skills govern that code (Glean-first decision already made;
  these route the implementation).
- Pre-existing uncommitted paid-search edits were carried onto this branch from
  the prior branch and are unrelated to this work.
