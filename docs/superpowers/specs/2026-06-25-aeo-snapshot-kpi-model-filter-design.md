# AEO Snapshot KPIs — Respond to the Model Filter

**Date:** 2026-06-25
**Status:** Approved (pending spec review)

## Context

On the AEO (peec-ai) **Overview** tab, the "Snapshot KPIs" strip shows three
cards: **Visibility**, **Citation Share**, **AI Referral Traffic**. Selecting a
single AI model (e.g. ChatGPT) in the model filter does not change Citation
Share or AI Referral Traffic, and the user reports the strip appears static.

Investigation ([components/report-sections/peec-ai/index.tsx](../../../components/report-sections/peec-ai/index.tsx)):

- `models` flows correctly: `parseModelsParam` ([lib/peec/models.ts](../../../lib/peec/models.ts))
  returns a non-null `AEOModel[]` for a single selection and `null` for
  none/all. The canonical models are `ChatGPT, Perplexity, Gemini, Claude,
  Copilot, Google` (`AEO_MODELS`). `ModelFilter` renders on the Overview.
- **Visibility** (index.tsx:234) IS already model-aware — it averages the
  per-model `llmBreakdown` restricted to selected models, and hides its delta
  while filtered.
- **Citation Share** (index.tsx:188-190, 241) uses the aggregate
  `data.totalCitations` / `data.yourBrandCitations` — it ignores `models`.
- **AI Referral Traffic** (index.tsx:248) is summed from GA4 sessions by
  `sessionSource` via `isAiSource` ([lib/constants.ts](../../../lib/constants.ts));
  GA4 has no model dimension, so it ignores `models`.
- Per-model citation data already exists: `domainCitationsByModel:
  ByModel<string, number>` (i.e. `Record<domain, Partial<Record<AEOModel,
  number>>>`) is on `PeecOverview` and populated by the real client
  (lib/peec/client.ts ~718-731) and demo data (lib/demo-data/peec.ts ~131-150).
  The client's own domain is identified by `clients.domain` (normalized via
  `urlJoinKey`) where `yourBrandCitations` is computed (lib/peec/client.ts
  ~474-488). Profound has NO per-model citation data (v1 limitation).
- Existing by-model helpers live in [lib/peec/by-model.ts](../../../lib/peec/by-model.ts)
  (`sumByModel`, `avgByModel`).

## Decisions

- All three Snapshot KPIs respond to the model filter.
- Existing convention preserved: when a model filter is active, KPI **deltas are
  hidden** (no per-model prior-period data is fetched).
- AI Referral Traffic is attributed to a model by mapping the GA4 referrer
  domain to a model. Referrers with no clean model mapping (you.com, phind.com,
  poe.com, chat.mistral.ai, kagi.com, search.brave.com) and the `Google` (AI
  Overview) model are **excluded from a filtered view**; the unfiltered total is
  unchanged.
- On the **Profound** tab, Citation Share shows `--` when a model filter is
  active (no per-model citation data).

## Item A — Citation Share model-aware

**Goal:** When a model filter is active, Citation Share reflects only the
selected models.

- Add two derived fields to the overview type (`PeecOverview`):
  - `totalCitationsByModel: Partial<Record<AEOModel, number>>`
  - `yourBrandCitationsByModel: Partial<Record<AEOModel, number>>`
- Compute them in `lib/peec/client.ts` where `yourDomainKey` and the per-domain
  rows are already known:
  - `totalCitationsByModel[m]` = sum over ALL domains of
    `domainCitationsByModel[domain][m]`.
  - `yourBrandCitationsByModel[m]` = sum over domains whose normalized host ===
    `yourDomainKey` of `domainCitationsByModel[domain][m]`.
- Populate both in `lib/demo-data/peec.ts`, derived from the existing
  `DOMAIN_CITATIONS_BY_MODEL` (your-brand = the client's own domain rows, e.g.
  `avenuez.com` + `blog.avenuez.com`).
- Add the same two fields to `ProfoundOverview` (lib/profound/client.ts) as
  empty objects `{}` (type parity; no per-model data).
- In `index.tsx` `ProviderSection`, when `modelActive`:
  - `numer = sum(yourBrandCitationsByModel[m] for m in models)`
  - `denom = sum(totalCitationsByModel[m] for m in models)`
  - `citationShareNow = denom > 0 ? (numer / denom) * 100 : null` → renders `--`
    when null (covers Profound's empty maps).
  - Hide the Citation Share delta while filtered.
  - Update the subtitle to reflect the filtered counts
    (`${numer} of ${denom} citations`) when filtered.
- When not filtered: unchanged (current aggregate behavior).

## Item B — AI Referral Traffic model-aware

**Goal:** When a model filter is active, AI Referral Traffic sums only sessions
whose GA4 referrer maps to a selected model.

- In `lib/constants.ts`, add a referrer→model map and a lookup helper alongside
  `AI_REFERRER_DOMAINS` / `isAiSource`:
  - `AI_SOURCE_TO_MODEL` mapping: `chat.openai.com`/`chatgpt.com` → `ChatGPT`;
    `perplexity.ai` → `Perplexity`; `claude.ai` → `Claude`;
    `gemini.google.com`/`bard.google.com` → `Gemini`;
    `copilot.microsoft.com`/`bing.com` → `Copilot`.
  - `aiSourceModel(source: unknown): AEOModel | null` — returns the mapped model
    or `null` (unmapped AI/non-AI source).
- In `index.tsx` `PeecAIReport`, the AI session sum becomes model-aware: when
  `models != null`, sum sessions where `aiSourceModel(r.sessionSource)` is in
  `models`; otherwise the existing all-AI sum (`isAiSource`). Apply to the
  current period; the delta is hidden while filtered (so the prior-period sum is
  not needed for the filtered case).
- In `ProviderSection`, hide the AI Referral Traffic delta when `modelActive`.
  The value renders the (possibly `0`) filtered session count.

## Item C — Verify Visibility

**Goal:** Confirm Visibility actually moves when a single model is selected
(the user reported the whole strip static).

- No planned code change. During verification, load the AEO Overview in demo
  mode, select one model, and confirm Visibility changes. If it does not,
  root-cause the `models` wiring (e.g. `llmBreakdown[].model` not matching
  `AEO_MODELS` canonical strings) and fix within this work.

## Out of scope

- Per-model prior-period data / deltas while filtered (kept hidden, per
  convention).
- Profound per-model citation data (genuine v1 gap).
- Attributing generic AI search referrers or Google AI Overview to a model in
  GA4 (no reliable signal).
- Any change to the Match Status / Content Action legend (confirmed accurate).

## Risk / notes

- Model name alignment is verified: `AEO_MODELS`, `llmBreakdown[].model`,
  `domainCitationsByModel` inner keys, and `brandVisibilityByModel` inner keys
  all use the same canonical strings (via `normalizeSource`).
- `aiTraffic` is computed once in the parent and shared by both provider tabs;
  the model filter is global, so a single model-aware computation is correct.
- Verify the data-layer changes with `npx tsc --noEmit` AND `npm run build`
  (the AEO components are client/server boundary code).
