# Configurable Dashboard — Sub-project #4: NL → Config Resolver — Design

**Status:** Approved (brainstorm)
**Date:** 2026-06-18
**Branch:** `feat/configurable-dashboard-rnd`
**Parent design:** `2026-06-17-configurable-dashboard-design.md` (sub-project #4 of 5)
**Builds on:** #1 (`BlockConfig`, the resolution contract), #2 (`parseBlockConfig` validator), and the existing `lib/glean.ts` TypeScript Glean client.

---

## 1. Summary

A server-side resolver that turns a natural-language description into a
**validated, structured leaf `BlockConfig` proposal** (or a clarifying question)
by calling Glean's chat API. Glean uses its Supermetrics MCP access to discover
and validate metrics/accounts at authoring time; the resolver extracts a strict
JSON object from Glean's reply, validates it with #2's `parseBlockConfig`, and
returns a discriminated result. This is the "authoring-time intelligence" half
of the two-phase architecture (#1 spec §2); runtime stays the deterministic REST
path.

**This sub-project is the resolver library only.** The editable preview-card UI
and the "add block" entry point are deferred to a later #3/#4 integration step
(to avoid colliding with the teammate building #3). Aggregate NL formulas are
sub-project #5.

---

## 2. Key decisions (from brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Transport | Reuse the existing **`lib/glean.ts`** TS client (`POST ${GLEAN_BASE_URL}/chat`) | Already the sanctioned pattern (`app/api/glean/meeting-brief/route.ts`); no Python sidecar |
| Provider skill | `glean-first-llm` confirms Glean; **`glean-chat-client` (Python) does not apply** | This is a TS app with an existing TS Glean client |
| Scope | **Resolver lib only** (leaf sources: supermetrics, triplewhale) | Clean separation from the teammate's #3 UI; aggregate NL is #5 |
| Output | Discriminated `ResolutionResult` (`proposal | clarify | error`) | Mirrors #1's never-throw discipline; serves the preview card later |
| Structured output | **Prompt Glean for one strict JSON object**, then validate | Glean chat is free-form/agentic; no assumed native schema mode |
| Validation | Reuse #2 `parseBlockConfig` on the proposed `config` | Single source of truth; an emitted proposal is always contract-valid |
| Testing | Pure units with an **injected fake Glean**; no live calls/creds | Mirrors #1; LLM output is non-deterministic |

---

## 3. Architecture & data flow

```
resolveBlockNL({ source, prompt, actAsEmail }, deps?)
  │
  ├─ buildResolutionPrompt(source, prompt)      # instructs Glean to return ONE fenced JSON object per schema
  ├─ deps.chat(messages, actAsEmail)            # Glean POST /chat (agentic: its Supermetrics MCP discovers/validates)
  ├─ extractJson(messages)                       # last valid ```json block from GLEAN_AI fragments
  ├─ parseProposal(json)                          # shape-check; config validated via #2 parseBlockConfig
  └─ ResolutionResult                             # proposal | clarify | error  (one repair retry on failure)
```

- **Server-side only** (`lib/glean.ts` holds the API token); never imported into a client component.
- **`actAsEmail`** is passed by the caller (the authoring user's email) and forwarded via `getGleanHeaders(actAsEmail)` so Glean's Supermetrics access runs in that user's context.
- **Dependency injection** (mirrors #1's `resolveLeaf`): `deps.chat?: GleanChatFn`. The real implementation does the HTTP call; tests inject a fake returning canned Glean message arrays. The HTTP wrapper is the only un-unit-tested unit.
- **Glean owns discovery.** The prompt instructs Glean to validate the metric/account against Supermetrics and to enumerate candidate metrics/accounts. The resolver never calls the MCP directly.

---

## 4. Output contract

```ts
export type GleanMessage = {
  author: string
  fragments: Array<{ text?: string; citation?: { sourceDocument?: { title?: string; url?: string } } }>
}
export type GleanChatFn = (messages: GleanMessage[], actAsEmail: string) => Promise<GleanMessage[]>

export interface Candidate { value: string; label: string; confidence?: number }

export interface BlockProposal {
  config: BlockConfig          // best-guess, already validated by parseBlockConfig (LEAF binding only)
  confidence: number           // 0..1 for the core metric
  alternatives: {              // ranked best-first, capped at 5 — drives the preview-card dropdowns later
    metric?: Candidate[]
    account?: Candidate[]
  }
}

export type ResolutionResult =
  | { kind: 'proposal'; proposal: BlockProposal }
  | { kind: 'clarify'; question: string }     // intent ambiguity — a narrowing question, not a picker
  | { kind: 'error'; error: string }          // Glean failed / unparseable after one repair retry
```

Ambiguity mapping (PRD §6): **metric** & **account/scope** ambiguity → populated
`alternatives`; **intent** ambiguity (underspecified) → `kind:'clarify'`. A
proposal's `config` is always a valid leaf `BlockConfig`, so anything stored
downstream is contract-valid; `id` is assigned by the save step, not the resolver.

---

## 5. Reliability & verification

- **Prompt for one fenced JSON object** with an explicit, source-specific schema
  (the binding fields for the chosen source, plus `confidence`, `alternatives`,
  and an optional `clarify` string). The prompt forbids prose outside the JSON.
- **`extractJson(messages)`** scans `GLEAN_AI` fragments and returns the **last**
  valid ```json block (the final answer, after thinking/tool-call messages),
  `JSON.parse`d. No JSON found → treated as a failure.
- **Hard validation:** the proposal's `config` runs through #2 `parseBlockConfig`.
  Failure ⇒ not trusted.
- **One repair retry:** on extract/parse/validate failure, re-ask Glean once with
  the failure reason appended ("your last reply was not valid JSON matching the
  schema; return only the JSON"). Second failure ⇒ `kind:'error'`.
- **Confidence threshold → clarify:** if Glean's core-metric `confidence` is
  below `MIN_CONFIDENCE = 0.5` (one tunable constant), or Glean emits a `clarify`
  field, return `kind:'clarify'` rather than a half-empty proposal.
- **Never throws:** Glean HTTP/network errors are caught → `kind:'error'`.

---

## 6. Testing

Pure units with an injected fake Glean; **no live calls, no creds in tests**
(`tsx` + `node:assert`, env-free):

- `buildResolutionPrompt(source, prompt)` — includes the source and the strict-JSON schema instructions; differs per source.
- `extractJson(messages)` — pulls the final JSON from a realistic multi-message array (thinking + tool-call + final); ignores non-JSON fragments; returns null when absent.
- `parseProposal(json)` — valid proposal; below-threshold → clarify; explicit `clarify` field → clarify; invalid `config` → rejected (error); `alternatives` capped at 5 and ranked.
- `resolveBlockNL(..., { chat: fake })` — proposal path; clarify path; repair-retry-then-success; repair-retry-then-error; network-error → error.

The thin Glean HTTP wrapper (`glean-chat.ts`) imports `lib/glean.ts` (reads the
token from env); it is exercised manually/integration, not unit-tested — matching
the repo convention for network wrappers.

---

## 7. Files

```
lib/dashboard/nl/
  types.ts        # ResolutionResult, BlockProposal, Candidate, GleanMessage, GleanChatFn, MIN_CONFIDENCE
  prompt.ts       # buildResolutionPrompt(source, prompt)
  extract.ts      # extractJson(messages): unknown | null
  parse.ts        # parseProposal(json): ResolutionResult  (reuses ../persistence parseBlockConfig)
  resolve.ts      # resolveBlockNL(input, deps?) — orchestrates chat + repair retry + threshold mapping
  glean-chat.ts   # real GleanChatFn over lib/glean.ts (thin; only un-unit-tested file)
  *.test.ts       # colocated, pure, fake-Glean
```

---

## 8. Out of scope / open items

- **Preview-card UI + "add block" entry point** — later #3/#4 integration; this sub-project ends at `ResolutionResult`.
- **Aggregate NL formulas** — sub-project #5 (cross-source operands + operation).
- **Persistence** — saving a confirmed config uses #2's `saveDashboardConfig` (the UI integration wires it).
- **Glean creds for local/real runs:** `GLEAN_API_TOKEN` + `GLEAN_INSTANCE` must be in `.env.local` to exercise the live path; unit tests do not need them.
- **`MIN_CONFIDENCE = 0.5`** is an initial guess; tune once we observe Glean's confidence calibration on real prompts.
- **Account-candidate quality** depends on Glean reliably enumerating connected accounts via the Supermetrics MCP; validate during integration.
