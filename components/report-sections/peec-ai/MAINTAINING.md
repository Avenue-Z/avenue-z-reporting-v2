# Maintaining the AEO (peec-ai) section

This section renders from a registry of **versioned parts** resolved against a per-client
config + a shared template. Full design: `docs/superpowers/specs/2026-06-30-per-client-report-sections-design.md`.
This repo runs **posture A: composition freeze** — read this before changing a part.

## The one rule

**Editing in place is normal. A new version is only for coexisting looks.**

| You want to… | Do this | New version? |
|---|---|---|
| Fix a bug / correct data / restyle for **everyone** | Edit the part (or the shared leaf) in place, then `npm test -- <part>.golden` and `-u` the snapshot after reviewing the diff | **No** |
| Change a client's parts, order, labels, thresholds | Edit that client's `report_section_config` (no code) | No |
| Give **one client a different rendering** of a part while others keep the old one | Author a **new version** (below) and pin that client to it | **Yes** |
| A component only one client needs | Add a **bespoke** part in `parts/bespoke/` and reference it in that client's `extraParts` | (versioned, but isolated) |

Goldens are **updatable regression checks**, not an immutability lock. A red golden means
"this part's output changed — intended?" If intended, review the diff and `-u`. If not, fix
the code.

## Making a new version (only for durable coexisting looks)

Worked example: `parts/visibility-chart.v2.tsx`.

1. New file `parts/<name>.v<N>.tsx` exporting a `PartImpl` with `version: N`, `published: true`,
   and its `render`. **Leave the old version's file untouched.** If it changes a shared leaf's
   look, render a forked/parameterized leaf so older versions are unaffected.
2. Register it in `parts/registry.ts`: `'<name>': { 1: v1, 2: v2 }`.
3. Add `parts/<name>.v<N>.golden.test.tsx`.
4. Adopt via config only: pin clients (`versions: { '<name>': N }`) or `promoteToTemplate`
   to make it the default. **Promote is the only thing that changes the template** — skip it
   and the template (and other clients) stay put.

## Keep versions from piling up

A version only needs to exist while some template row or client config pins it. After a
change is promoted and stragglers migrated, **delete the now-unreferenced old version file +
its golden**. The existence guard (`guard.test.ts`) lists what's still referenced; anything
not referenced is safe to delete. Steady state is ~one version per part.

## Isolation invariant

Rendering a client reads **that client's own** `report_section_config`. There's no shared
mutable state, so customizing client X can never affect client Y. `promoteToTemplate` is the
only write that touches shared state (the template).

## Overview v2 layout (staging)

The redesigned AEO Overview is built as new parts (and new versions of existing parts) that reach
a client **only** through that client's `report_section_config['peec-ai']`:

- `extraParts`: new part ids the template doesn't have (`[{ "id": "...", "version": 1 }]`).
- `versions`: pin an existing part to a new version (`{ "<part>": 2 }`).
- `hidden`: part ids removed from the layout.
- `order`: the final ordering of the ids above.

Apply it to **staging Neon only** until the account lead approves. The production flip is slice 7
(spec section 4). Slice 1 adds no parts yet, so there is nothing to pin: the compare/deltas
plumbing is live for every client but only honored on the v2 layout (v1 pages, cache keys and export bodies are unchanged, and the picker only writes `compareRange` when the user changes Compare to).

Staging override shape (`<...>` placeholders are filled in by the slice that adds the part; omit `versions`/`extraParts`/`order` until then). The three `hidden` entries are the removals every v2 layout makes; add
the v1 part each later slice replaces as that slice lands, and list its replacement in
`extraParts`/`versions`/`order`:

```json
{
  "peec-ai": {
    "hidden": ["domains-row", "competitor-visibility", "competitor-gaps"],
    "versions": { "<part-id>": 2 },
    "extraParts": [{ "id": "<new-part-id>", "version": 1 }],
    "order": ["<new-part-id>"]
  }
}
```

Before applying a staging override, save the client's current `peec-ai` override. Revert by restoring that saved value (or remove only the v2 entries); do not delete the key, which would also drop any pre-existing override. Edit with the SQL editor on the staging branch
(see the Neon migrate and seed warnings: do not run `db:seed`, it overwrites `enabled_reports`).

### Section 01 · Snapshot KPIs

- Turn it on with `versions: { "kpi-cards": 2 }` in the client's `report_section_config['peec-ai']` (staging Neon only until the account lead approves).
- The KPI choice lives in the same override's `kpis`. Melena sets it with **Edit KPIs** on the staging dashboard; the staff-only action `setAeoKpis` (`app/actions/aeo-kpis.ts`) saves it. Never hand-edit it in SQL: `saveReportSectionConfig` rejects a `kpis` key and preserves the stored one. Absent `kpis` = the default five.
- Slice 7's flip script must leave `kpis` untouched (it clears only `versions`, `order`, `hidden` and `extraParts` entries).
- `leads` follow `clients.ga4_config.leadEvents` when set, else GA4 key events (the choice lives in `summarizeAiKpis`, `lib/ga4/ai-kpis.ts`).
- Profound: visibility, share of voice and rank come from the visibility report (Visibility-type prompts by construction). Sentiment comes from `/v2/reports/sentiment` (Sentiment-type prompts by construction) through `lib/profound/sentiment-kpi.ts`, which reads category and brand from the client row only. "Used as a source %" is unavailable on Profound (no per-answer retrieval metric).
- The GA4 KPI and Profound sentiment fetches run only when the layout includes `kpi-cards@2`.
