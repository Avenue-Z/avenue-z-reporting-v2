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
- `order`: a priority list, not a partial reorder: the ids it names come first, in its order, and every visible part it
  leaves out follows in template order (`lib/report-sections/resolve.ts`). So `order` must list **every visible part id, in
  page order**; a partial list moves the listed parts to the top of the page.

Apply it to **staging Neon only** until the account lead approves. The production flip is slice 7
(spec section 4). Slice 1 added no parts: the compare/deltas
plumbing is live for every client but only honored on the v2 layout (v1 pages, cache keys and export bodies are unchanged, and the picker only writes `compareRange` when the user changes Compare to).

Slice 2 (02 Visibility vs Competitors) adds `visibility-chart@2` and `brand-rankings@2`. **Read the client's current staging override first and add only these entries**: slices 4 and 6 edit the same JSON in parallel, so never paste over it.

Slice 3 (04 Topics & Prompts) adds `topic-matrix@1` and `prompt-performance@1` and replaces `winners-losers`. **Read the current staging override first and add only this slice's entries**: put both new parts in `extraParts` (`version: 1`), add `"winners-losers"` to `hidden`, and in `order` put `topic-matrix` then `prompt-performance` where `winners-losers` stood (after `llm-breakdown`). Slices 4 and 6 edit the same JSON.

Slice 5 (03 Performance by AI Model) adds `llm-breakdown@2`. **Read the current staging override first and add only this slice's entries**: add `"llm-breakdown": 2` to `versions`. `order` already lists `llm-breakdown` between `brand-rankings` (02) and `topic-matrix` (04), so it stays the full list below. Slices 4 and 6 edit the same JSON.

Staging override after slices 3 and 5 (after slice 2 it was the same without the slice 3 entries). The three `hidden` entries are the removals every v2 layout makes; add the v1 part each
later slice replaces as that slice lands, list its replacement in `extraParts`/`versions`, and insert its id into `order`
at its place on the page (`order` always names every visible part):

```json
{
  "peec-ai": {
    "hidden": ["domains-row", "competitor-visibility", "competitor-gaps", "winners-losers"],
    "versions": { "visibility-chart": 2, "brand-rankings": 2, "llm-breakdown": 2 },
    "extraParts": [{ "id": "topic-matrix", "version": 1 }, { "id": "prompt-performance", "version": 1 }],
    "order": ["overview-synopsis", "kpi-cards", "visibility-chart", "brand-rankings", "llm-breakdown", "topic-matrix", "prompt-performance", "footer"]
  }
}
```

A new part from a later slice goes in `extraParts` (`[{ "id": "<new-part-id>", "version": 1 }]`) and in `order`.

**Two "Citation share" numbers on a Profound client (Avenue Z) until slice 6.** Until slice 6 replaces `kpi-cards@1`, a
Profound client on the v2 layout sees two different figures with similar names, and they are not expected to agree:

- the v1 **Citation Share** KPI tile (`kpi-cards@1`): the client's share of citation counts across **all** prompts,
  matching the client's `clients.domain` exactly;
- the brand table's **Citation share %** (`brand-rankings@2`): the share of citations from **Visibility** prompts that point
  at any of the brand's Profound asset domains (website and alternate domains, subdomains included).

Say so to anyone QAing the staging page.

Before applying a staging override, save the client's current `peec-ai` override. Revert by restoring that saved value (or remove only the v2 entries); do not delete the key, which would also drop any pre-existing override. Edit with the SQL editor on the staging branch
(see the Neon migrate and seed warnings: do not run `db:seed`, it overwrites `enabled_reports`).
