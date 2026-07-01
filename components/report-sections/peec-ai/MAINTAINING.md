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
