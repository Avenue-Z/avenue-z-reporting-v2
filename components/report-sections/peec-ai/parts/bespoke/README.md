# Bespoke Parts — Convention

This folder holds client-specific part implementations for the AEO (Peec AI) section.

## Rules

1. **Versioned.** Every bespoke part must carry a version number (`v1`, `v2`, …). Never mutate an existing version; always add a new one.

2. **`published` only when promoted/frozen.** Set `published: true` only when the part is stable and ready for production use. Drafts must have `published: false` (or omit the flag) so the guard test catches accidental references.

3. **Referenced only via `extraParts`.** Client configs reference bespoke parts through their `extraParts` field. Bespoke part IDs must never appear in the shared `PEEC_TEMPLATE` order — they are layered on top of the base template at render time via `mergeRegistries(PEEC_PARTS, BESPOKE_PARTS)`.

4. **Receives only the shared `PeecCtx`.** Bespoke parts are plain `PartImpl<PeecCtx>` — they get the same context as core parts. Do not create bespoke context shapes.

5. **The core registry must never import from here.** `components/report-sections/peec-ai/parts/registry.ts` (and all non-bespoke `parts/*.tsx` files) must not import anything from `**/parts/bespoke/**`. This separation keeps the core bundle clean and ensures bespoke code is only loaded for clients that use it.

## ESLint Boundary

A `no-restricted-imports` rule in `eslint.config.mjs` forbids `parts/registry.ts` and non-bespoke `parts/*.tsx` from importing `**/parts/bespoke/**`. If a zoned rule cannot be applied cleanly, enforce via code review: any PR adding a bespoke import to core files must be rejected.

## Adding a Bespoke Part

```ts
// parts/bespoke/my-client-hero.tsx
import type { PartImpl } from '@/lib/report-sections/types'
import type { PeecCtx } from '../../ctx'

export const myClientHeroV1: PartImpl<PeecCtx> = {
  published: false, // set true only when promoted
  render(ctx) {
    return <div>…</div>
  },
}
```

Then add it to `BESPOKE_PARTS`:
```ts
// parts/bespoke/registry.ts
import { myClientHeroV1 } from './my-client-hero'

export const BESPOKE_PARTS: PartRegistry<PeecCtx> = {
  'my-client-hero': { 1: myClientHeroV1 },
}
```

And reference it in the client's config `extraParts`:
```ts
extraParts: [{ id: 'my-client-hero', version: 1 }]
```
