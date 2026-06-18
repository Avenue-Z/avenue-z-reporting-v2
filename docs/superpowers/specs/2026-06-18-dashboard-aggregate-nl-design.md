# Configurable Dashboard — Sub-project #5: Aggregate NL Formulas — Design

**Status:** Approved (brainstorm)
**Date:** 2026-06-18
**Branch:** `feat/configurable-dashboard-rnd`
**Parent design:** `2026-06-17-configurable-dashboard-design.md` (sub-project #5 of 5 — final resolver piece)
**Builds on:** #1 (`AggregateBinding`), #2 (`parseBlockConfig`, which validates aggregate bindings), #4 (`extract.ts`, `glean-chat.ts`, the prompt→extract→parse→repair pattern, `Candidate`, `MIN_CONFIDENCE`).

---

## 1. Summary

Resolve a free-form natural-language **formula** (e.g. "blended ROAS = TripleWhale
revenue ÷ Supermetrics ad spend") into a validated **aggregate `BlockConfig`
proposal** — two leaf operands (possibly cross-source) combined by one binary
operator — or a clarifying question. A single agentic Glean call returns the
whole structure; it is validated with #2's `parseBlockConfig` and returned as a
discriminated result, mirroring #4.

This is the **resolver library only** (like #4). The preview-card UI is deferred
to the later UI integration. This completes the authoring-time intelligence for
all three sources (supermetrics, triplewhale, aggregate).

---

## 2. Key decisions (from brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Resolution approach | **A — single agentic Glean call** returns the whole aggregate | Glean is agentic (multi-tool in one turn); ~3× cheaper than composing; reuses `parseBlockConfig` for the full structure; closest to #4. Upgrade path to a hybrid fallback exists if real runs prove flaky |
| Operand model | Two **leaf** operands + one binary op (`+ - * /`) | Matches #1's `AggregateBinding` exactly; no nesting / >2 operands |
| Input | `{ formula, actAsEmail }` — **no source param** | The formula names both operands' sources; the user picked "Aggregate" |
| Validation | Reuse #2 `parseBlockConfig`; **require** `binding.source === 'aggregate'` | Single source of truth; mirror of #4's reject-aggregate guard |
| DRY | Extract a generic `resolveWithRepair` runner; refactor #4's `resolve.ts` to use it | Avoids duplicating the prompt→chat→extract→parse→repair loop |
| Provider | Glean via existing `lib/glean.ts` (TS); `glean-first-llm` confirms Glean | Same as #4; `glean-chat-client` (Python) N/A |
| Testing | Pure units with injected fake Glean; no live calls/creds | Same as #4 |

---

## 3. Architecture & data flow

```
resolveAggregateNL({ formula, actAsEmail }, deps?)
  └─ resolveWithRepair({ buildPrompt: () => buildAggregatePrompt(formula), parse: parseAggregateProposal }, chat, actAsEmail)
       ├─ chat([USER: prompt], actAsEmail)        # reuse glean-chat.ts; Glean discovers BOTH operands in one agentic turn
       ├─ extractJson(reply)                        # reuse #4 extract.ts unchanged
       ├─ parse(json)                               # parseAggregateProposal
       └─ on error: ONE repair retry, else result   # generic runner, shared with #4
```

- **Server-side only.** Reuses `lib/glean.ts` (`GLEAN_BASE_URL`, `getGleanHeaders(actAsEmail)`).
- **`resolveWithRepair`** (new `run.ts`) is the generic orchestrator: `({ buildPrompt, parse }, chat, actAsEmail)` → builds the prompt, calls chat, `extractJson` → `parse`, one repair retry on error, try/catch → `error`. Both #4 (`resolveBlockNL`) and #5 (`resolveAggregateNL`) call it.

---

## 4. Output contract

```ts
import type { Candidate } from './types' // reuse #4

export interface AggregateProposal {
  config: BlockConfig          // binding is an AggregateBinding; validated; id is '__pending__'
  confidence: number           // 0..1 for the overall formula
  alternatives: {              // nested per operand — drives the preview card's two operand dropdowns later
    left?: { metric?: Candidate[]; account?: Candidate[] }
    right?: { metric?: Candidate[]; account?: Candidate[] }
  }
}

export type AggregateResolutionResult =
  | { kind: 'proposal'; proposal: AggregateProposal }
  | { kind: 'clarify'; question: string }
  | { kind: 'error'; error: string }

export interface AggregateResolveInput { formula: string; actAsEmail: string }
```

A proposal's `config.binding` is always a valid `AggregateBinding` (two valid
leaf operands + a valid op), so anything stored downstream is contract-valid.

---

## 5. Reliability & verification

- **Prompt for one fenced JSON object** with the aggregate schema: `config` with
  `binding: { source:'aggregate', op, left:<leaf>, right:<leaf> }`, `format`,
  `range: null`; plus `confidence`, nested `alternatives.left/right`, optional
  `clarify`. Each operand leaf is supermetrics (`dsId`/`metricField`/`account`)
  or triplewhale (`metric`). The prompt forbids prose outside the JSON and tells
  Glean to validate operands against its tools.
- **`extractJson`** (reused) → final JSON block; none → failure.
- **Hard validation:** assemble the config with id `'__pending__'`, run through
  `parseBlockConfig` (validates op + both leaves). Failure ⇒ not trusted.
- **Require aggregate:** if the validated `binding.source !== 'aggregate'`
  (Glean collapsed the formula to a single metric) ⇒ `error` with a clear message.
- **One repair retry** on any failure; **`confidence < MIN_CONFIDENCE` (0.5) or an
  explicit `clarify`** ⇒ `clarify`; **never throws** (Glean/network → `error`).

---

## 6. DRY: shared repair runner

#4's `resolve.ts` and #5's `aggregate-resolve.ts` share the same orchestration
loop. Extract it into `lib/dashboard/nl/run.ts`:

```ts
resolveWithRepair<T>(
  opts: { buildPrompt: () => string; parse: (json: unknown) => T & ({ kind: 'error' } | object) },
  chat: GleanChatFn,
  actAsEmail: string,
): Promise<T>
```

(The result type is the per-caller discriminated union; the runner only needs to
detect `kind === 'error'` to trigger the single repair retry.) **#4's `resolve.ts`
is refactored to call `resolveWithRepair`** — safe because the branch is unmerged,
the public `resolveBlockNL` signature and `ResolutionResult` are unchanged, the
teammate's #3 does not touch `resolve.ts` internals, and #4's existing
`resolve.test.ts` re-runs to confirm no regression.

---

## 7. Testing

Pure units, injected fake Glean, env-free (`tsx` + `node:assert`):

- `buildAggregatePrompt(formula)` — embeds the formula + the aggregate schema (left/op/right, `alternatives.left/right`, `clarify`).
- `parseAggregateProposal(json)` — valid cross-source aggregate (one TW + one SM operand); explicit `clarify`; below-threshold → clarify; non-aggregate single-leaf result → error; invalid operand → error; bad op → error; nested `alternatives.left/right` parsed, ranked, capped at 5.
- `resolveWithRepair` — generic: proposal; clarify (no retry); repair-retry-success; repair-exhausted → error; chat throws → error. Uses a fake `parse` + fake `chat`.
- `resolveAggregateNL(..., { chat: fake })` — wires aggregate prompt + parse through the runner; end-to-end proposal/clarify/error.
- Refactored #4 `resolve.test.ts` still green (no behavior change).

The thin Glean HTTP wrapper (`glean-chat.ts`) is unchanged and remains
manually/integration-verified.

---

## 8. Files

```
lib/dashboard/nl/
  run.ts                 # NEW: resolveWithRepair generic runner
  run.test.ts            # NEW
  aggregate-types.ts     # NEW: AggregateProposal, AggregateResolutionResult, AggregateResolveInput
  aggregate-prompt.ts    # NEW: buildAggregatePrompt(formula)
  aggregate-parse.ts     # NEW: parseAggregateProposal(json)  (reuses ../persistence parseBlockConfig, ./types Candidate, MIN_CONFIDENCE)
  aggregate-resolve.ts   # NEW: resolveAggregateNL(input, deps?)  (uses run.ts + aggregate-prompt + aggregate-parse + glean-chat)
  resolve.ts             # MODIFY: refactor to use run.ts (behavior unchanged)
  *.test.ts              # colocated, pure, fake-Glean
```

---

## 9. Out of scope / open items

- **Preview-card UI** for the two-operand editor — later UI integration.
- **Nesting / >2 operands / mixed precedence** — #1 is a single binary op; deferred.
- **Persistence** — saving uses #2's `saveDashboardConfig`; the save step replaces the `'__pending__'` id.
- **Hybrid fallback (approach C)** — if the single-call JSON proves flaky in real runs, add a per-operand fallback later.
- **Carries #4's integration notes:** Glean `/chat` turn-alternation on the repair retry; live `GLEAN_*` creds needed for real runs (unit tests do not).
