# Top Content: sort by Views and Engagements on outline tabs (plan, not built)

From Jasmine's staging review, round 1: "Can we only give the ability to sort by views and engagements. Remove
Engagement Rate and Effectiveness." Applies to the outline clients only. Renaissance keeps all four.

## Today (origin/dev d4f4a42)
- The sort buttons come from `SORT_METRICS` (`lib/organic-social/sort-content.ts:8-13`): Effectiveness, Engagement
  Rate, Engagements, Views / Impr. They are rendered at `sortable-top-content.tsx:125`. The default sort is
  Engagements (`:90`).
- Every post card lists all four metrics (`post-card.tsx:11-19`).
- `SortableTopContent` is shared: Renaissance reaches it through `parts/top-content.tsx:77` (top-content v1/v2), and
  outline clients through `parts/top-content-outline.tsx:43` (top-content@3, pinned only for them).

## Change
- An optional list of sort metrics on `SortableTopContent`, defaulting to `SORT_METRICS`. Only
  `top-content-outline.tsx` passes Engagements and Views. The default sort stays Engagements, so the top 5 a client sees
  does not change.
- Influencer Posts shares the same toolbar, so it follows the same list.
- Pending her answer: if the two metrics also come off the cards, an optional metric list on `PostCard`, same pattern.
  `SORT_METRICS` itself and `PostCard`'s default stay as they are.
- Applies to every client pinned to top-content@3: the three outline clients today, Piper and PIMCO once they are
  switched on. The pin covers every platform tab, X included.

## Tests first
- Outline tabs show exactly two sort buttons, Engagements selected.
- top-content v2 (Renaissance's path) still shows four buttons and four card rows.
- Influencer rows sort with the two-button list.
- If cards change: outline cards show two rows, v2 cards four.

## Independence
- Touches only `sortable-top-content.tsx`, `parts/top-content-outline.tsx` and, if needed, `post-card.tsx`.
- Paul's #190 also edits `post-card.tsx` and `sortable-top-content.tsx`, but it already conflicts with `dev` by itself
  (six files, `sortable-top-content.tsx` among them, checked 2026-09-28 with `git merge-tree`), so it needs a rebase
  whatever happens here. Edits here stay away from the lines #190 changes so that rebase gets no harder.
- Renaissance fingerprint before and after.
