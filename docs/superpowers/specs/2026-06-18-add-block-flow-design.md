# Configurable Dashboard — Add-Block Flow — Design

**Status:** Approved (brainstorm)
**Date:** 2026-06-18
**Branch:** `feat/configurable-dashboard-rnd`
**Builds on:** #2 (`saveDashboardConfig`, `canEditDashboard`), #3 (dashboard shell + `config-mutations`), #4 (`resolveBlockNL`), #5 (`resolveAggregateNL`).

---

## 1. Summary

Let an editor **create a new block from natural language** in the UI — the last
piece of the end-to-end "type a metric → get a block" loop. A modal drives a
small state machine: pick source → enter NL → a server action resolves it via
the existing resolvers → an editable preview card (with ranked alternative
dropdowns) → confirm → persist via the existing `saveDashboardConfig`, which
revalidates so the RSC page resolves and renders the new block.

No changes to the resolution engine, the resolvers, or the persistence contract.

---

## 2. Key decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Surface | **Modal dialog** (a lightweight self-contained overlay component — no new dependency; the repo has no Dialog primitive) |
| Preview-card editability | **Ranked alternative dropdowns + editable name/format** ("fix only what's wrong", PRD §6). Free-typing raw field ids is out (PRD non-goal) |
| Aggregate v1 | **Create-but-confirm-only** — source → formula → resolve → name/format → confirm. Per-operand alternative dropdowns deferred (the 2-operand rebuild is fiddly; the resolver already returns a valid aggregate) |
| Server boundary | A `proposeBlock` **server action** wraps the server-only resolvers (Glean key) |
| Refresh after save | Reuse `saveDashboardConfig` (revalidates) + `router.refresh()` |

---

## 3. Architecture & data flow

```
[Add block] button (editors)        components/dashboard/add-block/
   │ opens                          add-block-button.tsx
   ▼
AddBlockDialog (client overlay)     add-block-dialog.tsx  — state machine:
   step 'pick'   → source picker (supermetrics | triplewhale | aggregate)
   step 'prompt' → NL textarea (or formula for aggregate) → Resolve
        │ proposeBlock({source, prompt, slug})  ── server action
        ▼
   ResolutionResult | AggregateResolutionResult
        ├─ kind 'clarify' → show question, back to 'prompt'
        ├─ kind 'error'   → show message, retry
        └─ kind 'proposal'→ step 'preview'
   step 'preview' → BlockPreviewCard (editable) → Confirm
        │ id = crypto.randomUUID()
        │ block = applySelections(proposal, selections, id)
        │ next  = addBlock(config, block)
        │ await saveDashboardConfig(slug, next)   ── existing server action (revalidates)
        ▼
   ok → close + router.refresh()  (RSC re-resolves → new block renders)
```

- `proposeBlock` is server-side because `resolveBlockNL`/`resolveAggregateNL` hold the Glean key.
- Confirm reuses the existing `saveDashboardConfig` (no new save path); the client builds the next config with the pure `addBlock` + `applySelections`.

---

## 4. Server action (`app/actions/dashboard.ts` — extend)

```ts
'use server'
export type ProposeBlockInput = {
  source: 'supermetrics' | 'triplewhale' | 'aggregate'
  prompt: string   // NL prompt for leaf sources; the formula for aggregate
  slug: string
}
export async function proposeBlock(
  input: ProposeBlockInput,
): Promise<ResolutionResult | AggregateResolutionResult>
```

Flow: `auth()` → if no session.user → `{ kind:'error', error:'unauthenticated' }`;
`canEditDashboard(session.user.role, session.user.clientSlug, input.slug)` false →
`{ kind:'error', error:'forbidden' }`; else
`const actAsEmail = session.user.email ?? ''`; for `aggregate` →
`resolveAggregateNL({ formula: input.prompt, actAsEmail })`, else
`resolveBlockNL({ source: input.source, prompt: input.prompt, actAsEmail })`.
Returns the resolver result verbatim (already `proposal | clarify | error`,
never throws).

---

## 5. Pure logic (unit-tested)

### `config-mutations.ts` (extend)
```ts
export function addBlock(config: DashboardConfig, block: PersistedBlock): DashboardConfig
// returns { ...config, blocks: [...config.blocks, block] } (new array)
```

### `components/dashboard/add-block/draft.ts` (new)
```ts
export interface BlockSelections {
  name: string
  format: MetricFormat
  metric?: string   // chosen alternative value (leaf only)
  account?: string  // chosen alternative value (leaf only)
}
export function applySelections(
  proposalConfig: BlockConfig,   // proposal.config (binding already valid; id is '__pending__')
  selections: BlockSelections,
  id: string,                    // caller passes crypto.randomUUID()
): BlockConfig
```
Behavior — clone `proposalConfig`, set `id`, `name`, `format`; then by
`binding.source`:
- `supermetrics`: if `selections.metric` set → `binding.metricField = metric`; if `selections.account` set → `binding.account = account`.
- `triplewhale`: if `selections.metric` set → `binding.metric = metric`.
- `aggregate`: no field swaps (operand dropdowns deferred) — only name/format/id.

The result is a valid `BlockConfig`; it is **not** re-validated here (the
resolver already validated it via `parseBlockConfig`, and selections only swap a
field to a resolver-supplied alternative value).

---

## 6. UI components (`components/dashboard/add-block/`)

- **`add-block-button.tsx`** — "+ Add block" button, rendered only when `canEdit`. Placed in the dashboard shell control row **and** in the empty-dashboard state. Opens the dialog (local `open` state).
- **`add-block-dialog.tsx`** — the modal overlay (fixed inset backdrop + centered card; Esc / backdrop-click closes) and the `pick → prompt → preview` state machine. Holds `useTransition` for the `proposeBlock` call and the save. Receives `slug` + the current `config`.
- **`block-preview-card.tsx`** — given a `proposal` (BlockProposal or AggregateProposal): shows `name` (text input, prefilled), the resolved source/metric/account (read-only text for confident fields), **dropdowns** for fields that have `alternatives` (leaf `metric`/`account`, best-first, best pre-selected), a `format` select, and Confirm/Cancel. For an aggregate proposal it shows the resolved formula summary + name/format + Confirm (no operand dropdowns in v1). Emits `BlockSelections` on confirm.

`frontend:brand-coherence` governs all three components (dark-first brand tokens,
canonical patterns) at build time.

---

## 7. Error / edge handling

- `proposeBlock` unauthenticated/forbidden → dialog shows the error, stays on `prompt`.
- `clarify` → dialog shows the question above the prompt; user edits + re-resolves.
- `error` → dialog shows the message; user retries.
- Empty prompt → Resolve disabled.
- `saveDashboardConfig` failure → dialog shows the error, stays on `preview` (no block added).
- The new block, once saved, renders through the normal RSC path — including its own `disconnected`/`no-data` state if the source isn't connected (independent of this flow).

---

## 8. Testing

- **Pure (`tsx` + `node:assert`):**
  - `addBlock` — appends, returns a new array, input unchanged.
  - `applySelections` — supermetrics (metric+account swap, name/format/id), triplewhale (metric swap), aggregate (name/format/id only, binding untouched); confident-field (no alternative) passthrough.
- **Server action `proposeBlock`** — thin (auth + resolver dispatch); covered by the resolver tests + manual; not unit-tested in isolation (env/Glean).
- **UI** — verified manually on the preview (no React test runner in-repo, consistent with #3). The `frontend:run` / preview is the check.

---

## 9. Files

```
components/dashboard/add-block/
  add-block-button.tsx
  add-block-dialog.tsx
  block-preview-card.tsx
  draft.ts
  draft.test.ts
components/dashboard/config-mutations.ts        # + addBlock
components/dashboard/config-mutations.test.ts    # + addBlock test
components/dashboard/dashboard-shell.tsx         # MODIFY: render AddBlockButton (control row + empty state)
components/dashboard/metric-block-states.tsx     # MODIFY: EmptyDashboardState gets an add entry point (editors)
app/actions/dashboard.ts                         # + proposeBlock server action
```

---

## 10. Out of scope (later)

- **Editing an existing block's definition via NL** (PRD §8 "Editing reopens the structured config alongside the original NL prompt") — separate follow-up.
- **Per-operand alternative dropdowns** for aggregate blocks.
- Synonym learning / cross-session disambiguation memory / confidence scores (PRD "deferred past MVP").
- The `__pending__` id is replaced here at confirm via `crypto.randomUUID()`; no server-side id assignment is added.
- Live data connections (TW shop id / SM account) remain a separate config concern — a created block renders its state regardless.
