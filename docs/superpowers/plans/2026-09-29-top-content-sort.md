# Top Content: sort by Views and Engagements on outline tabs, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On outline tabs (top-content@3), Top Performing Content offers only two sort buttons, Engagements and Views. Renaissance and every other client keep all four.

**Architecture:** `SortableTopContent` takes an optional list of sort keys, defaulting to all four, so nothing changes unless a caller passes one. Only `parts/top-content-outline.tsx` passes the outline list.

**Decided on the call with Jasmine, 2026-09-29 (26:06 to 26:28):** the two metrics come off the sort buttons only and STAY on the post cards. Task 2 below is therefore NOT built; it is kept only as a record of the option. "Across the board" means every outline client; Renaissance never gets this change (standing rule).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest with Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-29-top-content-sort-design.md` (reviewed twice; it wins where this plan differs; T1 to T8 below are its section 6). Source: Jasmine's staging feedback, round 1: "Can we only give the ability to sort by views and engagements. Remove Engagement Rate and Effectiveness." Applies to the outline clients. Renaissance stays untouched.

## Global Constraints
- Renaissance renders exactly as today. Its Top Content is v1/v2 (`parts/top-content.tsx:77`), which never passes the new prop.
- `SORT_METRICS` (`lib/organic-social/sort-content.ts:8-13`) is not edited. The default sort stays Engagements, descending (`sortable-top-content.tsx:90-91`).
- No request shape changes (nothing here touches Dash requests or lock keys).
- Branch `feat/os-top-content-sort`, cut from `dev`, standalone. Paul's #190 edits the same two components and already conflicts with `dev` by itself; do not try to fit around it.
- Checks: `DATABASE_URL=postgresql://ci:ci@db.invalid/ci make check` (the placeholder is what CI uses, `.github/workflows/ci.yml:51`).

## Review Focus
1. A list without Engagements: the first sort key in the list becomes the starting sort, never a sort that has no button.
2. An empty list: treated as absent (all four), never a toolbar with no buttons.
3. Influencer Posts follows the same toolbar, so it sorts only by the listed keys too.
4. Order: the buttons keep `SORT_METRICS` order (Engagements, then Views / Impr.), whatever order the caller lists.
5. The Renaissance drift check hashes `sortable-top-content.tsx`, so it will report it as changed. That is expected. The Top Content goldens do NOT hold the toolbar (spec section 2), so the proof that Renaissance renders the same is T7 (the v2 part passes no `sortKeys`) plus v1 never using `SortableTopContent`.

---

### Task 1: Two sort buttons on outline tabs

**Files:**
- Modify: `lib/organic-social/outline-top-content.ts` (add one export)
- Modify: `components/report-sections/organic-social/sortable-top-content.tsx:73-145`
- Modify: `components/report-sections/organic-social/parts/top-content-outline.tsx:7,43-44`
- Test: `components/report-sections/organic-social/sortable-top-content.test.tsx`
- Test: `components/report-sections/organic-social/parts/top-content-outline.test.tsx`

**Interfaces:**
- Produces: `OUTLINE_SORT_KEYS: readonly SortKey[]` in `lib/organic-social/outline-top-content.ts`, value `['engagements', 'impressions']`.
- Produces: `SortableTopContent` prop `sortKeys?: readonly SortKey[]`.

- [ ] **Step 1: Write the failing component tests** (append to `sortable-top-content.test.tsx`)

```tsx
const sortButtons = () => screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed')).map((b) => b.textContent)

test('T1 without sortKeys the toolbar shows all four metrics, Engagements active', () => {
  view({ owned: group([mk(1, 2), mk(2, 1)]) })
  expect(sortButtons()).toEqual(['Effectiveness', 'Engagement Rate', 'Engagements ↓', 'Views / Impr.'])
})

test('T2 sortKeys limits the toolbar to those metrics, in toolbar order, and Views sorts and flips', () => {
  // The two sorts order these posts oppositely: engagements 9 vs 1, impressions 1 vs 9.
  view({ owned: group([mk(1, 9, 1), mk(2, 1, 9)]), sortKeys: ['impressions', 'engagements'] })
  expect(sortButtons()).toEqual(['Engagements ↓', 'Views / Impr.'])
  expect(shownIn(document.body)).toEqual(['cap-1', 'cap-2'])
  fireEvent.click(screen.getByRole('button', { name: /Views \/ Impr\./i }))
  expect(sortButtons()).toEqual(['Engagements', 'Views / Impr. ↓'])
  expect(shownIn(document.body)).toEqual(['cap-2', 'cap-1'])
  fireEvent.click(screen.getByRole('button', { name: /Views \/ Impr\./i }))
  expect(sortButtons()).toEqual(['Engagements', 'Views / Impr. ↑'])
  expect(shownIn(document.body)).toEqual(['cap-1', 'cap-2'])
})

test('T3 a list without Engagements starts on its first listed metric', () => {
  view({ owned: group([mk(1, 9, 1), mk(2, 1, 9)]), sortKeys: ['impressions'] })
  expect(sortButtons()).toEqual(['Views / Impr. ↓'])
  expect(shownIn(document.body)).toEqual(['cap-2', 'cap-1'])
})

test('T4 an empty list is treated as no list', () => {
  view({ owned: group([mk(1, 2)]), sortKeys: [] })
  expect(sortButtons()).toHaveLength(4)
})

test('T5 influencer rows sort by the listed metrics too', () => {
  const influencer = group([mk(100, 1, 50), mk(101, 5, 10)])
  view({ owned: group([mk(1, 1)]), influencer, sortKeys: ['engagements', 'impressions'] })
  const inf = screen.getByRole('region', { name: 'Influencer posts' })
  expect(shownIn(inf)).toEqual(['cap-101', 'cap-100'])
  fireEvent.click(screen.getByRole('button', { name: /Views \/ Impr\./i }))
  expect(shownIn(inf)).toEqual(['cap-100', 'cap-101'])
})

test('T8 the cards keep all four metrics under a list', () => {
  view({ owned: group([mk(1, 2)]), sortKeys: ['engagements', 'impressions'] })
  for (const label of ['Effectiveness', 'Engagement Rate']) {
    expect(screen.getAllByText(label).some((el) => !el.closest('button'))).toBe(true)
  }
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run components/report-sections/organic-social/sortable-top-content.test.tsx`
Expected: T2, T3 and T5 FAIL (the toolbar still shows four buttons); T1, T4 and T8 pass already, since they pin today's behaviour (T4: an empty list already means four buttons because the prop is ignored; T8: the cards never change).

- [ ] **Step 3: Add the outline list** (`lib/organic-social/outline-top-content.ts`, new export near the other outline rules)

```ts
import type { SortKey } from './sort-content'

/** The sort buttons on outline tabs (Jasmine's round 1 feedback): Engagements and Views only. */
export const OUTLINE_SORT_KEYS: readonly SortKey[] = ['engagements', 'impressions']
```

- [ ] **Step 4: Give `SortableTopContent` the optional list** (`sortable-top-content.tsx`)

In the props destructure and type, after `ownedLimit`:

```tsx
  ownedLimit,
  sortKeys,
}: {
  ...
  ownedLimit?: number
  /** Only these sort buttons, in toolbar order. Absent or empty: all four, as today. */
  sortKeys?: readonly SortKey[]
}) {
  const metrics = sortKeys && sortKeys.length > 0 ? SORT_METRICS.filter((m) => sortKeys.includes(m.key)) : SORT_METRICS
  const [sortKey, setSortKey] = useState<SortKey>(metrics.some((m) => m.key === 'engagements') ? 'engagements' : metrics[0].key)
```

and render the toolbar from `metrics` instead of `SORT_METRICS`:

```tsx
        {metrics.map((m) => {
```

- [ ] **Step 5: Run the component tests**

Run: `npx vitest run components/report-sections/organic-social/sortable-top-content.test.tsx components/report-sections/organic-social/sortable-top-content.pagination.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 6: Write the failing wiring test** (append to `parts/top-content-outline.test.tsx`; `props()` already reads the mocked gallery's props)

```tsx
test('T6 outline tabs pass only the Engagements and Views sort buttons', async () => {
  fetchTopContentFrozen.mockResolvedValue([post(1)])
  await show()
  expect((props() as unknown as { sortKeys?: string[] }).sortKeys).toEqual(['engagements', 'impressions'])
})

// The Renaissance-path guard: the goldens hold no toolbar, so this pins that v2 never passes a list.
test('T7 the v2 part (Renaissance) passes no sortKeys', async () => {
  fetchTopContentFrozen.mockResolvedValue([post(1)])
  render(<>{await TopContentV2Section(IG)}</>)
  expect(SortableTopContent).toHaveBeenCalledTimes(1)
  expect(props()).not.toHaveProperty('sortKeys')
})
```

Run: `npx vitest run components/report-sections/organic-social/parts/top-content-outline.test.tsx`
Expected: T6 FAILS (`sortKeys` is undefined); T7 passes already (it pins what must not change).

- [ ] **Step 7: Pass the list from the outline part** (`parts/top-content-outline.tsx`)

Add `OUTLINE_SORT_KEYS` to the existing import on line 7, and on the `SortableTopContent` element:

```tsx
        clientSlug={clientSlug} canEdit={canSetDesignation(role)} ownedLimit={ownedLimit} sortKeys={OUTLINE_SORT_KEYS} />
```

- [ ] **Step 8: Run the Top Content tests, Renaissance's goldens included**

Run: `npx vitest run components/report-sections/organic-social/`
Expected: PASS, T7 included (the real Renaissance guard); the goldens stay green too but hold no toolbar.

- [ ] **Step 9: Commit**

```bash
git add lib/organic-social/outline-top-content.ts components/report-sections/organic-social/sortable-top-content.tsx components/report-sections/organic-social/sortable-top-content.test.tsx components/report-sections/organic-social/parts/top-content-outline.tsx components/report-sections/organic-social/parts/top-content-outline.test.tsx
git commit -m "feat(organic-social): Outline tabs sort Top Content by Engagements and Views only"
```

### Task 2: Post cards show only the listed metrics (NOT BUILT: decided 2026-09-29 that the cards keep all four)

**Files:**
- Modify: `components/report-sections/organic-social/post-card.tsx:11-20,55-57,70`
- Modify: `components/report-sections/organic-social/sortable-top-content.tsx` (pass the list to each card)
- Modify: `components/report-sections/organic-social/parts/top-content-outline.tsx` (pass `cardKeys`)
- Test: `components/report-sections/organic-social/post-card.pct.test.tsx`, `sortable-top-content.test.tsx`, `parts/top-content-outline.test.tsx`

**Interfaces:**
- Consumes: `OUTLINE_SORT_KEYS` (Task 1).
- Produces: `PostCard` prop `metrics?: readonly SortKey[]`; `SortableTopContent` prop `cardKeys?: readonly SortKey[]`.

- [ ] **Step 1: Write the failing card tests** (append to `post-card.pct.test.tsx`, reusing its post factory)

```tsx
const rowLabels = (c: HTMLElement) => [...c.querySelectorAll('li')].map((li) => li.firstChild?.textContent)

test('without metrics a card lists all four rows', () => {
  const { container } = render(<PostCard post={makePost({})} clientSlug="c" canEdit={false} />)
  expect(rowLabels(container)).toEqual(['Effectiveness', 'Engagement Rate', 'Engagements', 'Views / Impr.'])
})

test('metrics limits the card to those rows, in card order', () => {
  const { container } = render(<PostCard post={makePost({})} clientSlug="c" canEdit={false} metrics={['impressions', 'engagements']} />)
  expect(rowLabels(container)).toEqual(['Engagements', 'Views / Impr.'])
})
```

(`makePost` is the file's own factory, `post-card.pct.test.tsx:13-21`.)

Run: `npx vitest run components/report-sections/organic-social/post-card.pct.test.tsx`
Expected: the `metrics` test FAILS.

- [ ] **Step 2: Filter the card rows** (`post-card.tsx`)

```tsx
function cardMetrics(post: TopContentPost, sortKey: string, only?: readonly string[]): CardMetric[] {
  const m = post.metrics
  const rows = [
    // effectiveness + engagementRate are both fractions (×100 for %).
    { key: 'effectiveness', label: 'Effectiveness', value: m.effectiveness != null ? pctCompact(m.effectiveness * 100) : '—' },
    { key: 'engagementRate', label: 'Engagement Rate', value: m.engagementRate != null ? pctCompact(m.engagementRate * 100) : '—' },
    { key: 'engagements', label: 'Engagements', value: num(m.engagements) },
    { key: 'impressions', label: 'Views / Impr.', value: num(m.impressions) },
  ]
  return rows.filter((x) => !only || only.length === 0 || only.includes(x.key)).map((x) => ({ ...x, emphasised: x.key === sortKey }))
}
```

Add `metrics?: readonly string[]` to `PostCard`'s props and call `cardMetrics(post, sortKey, metrics)`.

- [ ] **Step 3: Thread the list through** (`sortable-top-content.tsx`): add `cardKeys?: readonly SortKey[]` to `SortableTopContent`, pass it to `PlatformCardRow` as `cardKeys`, and render `<PostCard ... metrics={cardKeys} />`. Add a test in `sortable-top-content.test.tsx` that `cardKeys: ['engagements', 'impressions']` leaves two rows per card and that no `cardKeys` leaves four.

- [ ] **Step 4: Pass it from the outline part** and extend the Task 1 wiring test to expect `cardKeys` equal to `['engagements', 'impressions']`.

```tsx
        ownedLimit={ownedLimit} sortKeys={OUTLINE_SORT_KEYS} cardKeys={OUTLINE_SORT_KEYS} />
```

- [ ] **Step 5: Run and commit**

Run: `npx vitest run components/report-sections/organic-social/`
Expected: PASS, goldens unchanged.

```bash
git add components/report-sections/organic-social/post-card.tsx components/report-sections/organic-social/post-card.pct.test.tsx components/report-sections/organic-social/sortable-top-content.tsx components/report-sections/organic-social/sortable-top-content.test.tsx components/report-sections/organic-social/parts/top-content-outline.tsx components/report-sections/organic-social/parts/top-content-outline.test.tsx
git commit -m "feat(organic-social): Outline post cards show Engagements and Views only"
```

### Task 3: Prove it and hand it over

- [ ] Run `DATABASE_URL=postgresql://ci:ci@db.invalid/ci make check`. Expected: typecheck, every test, the RSC check and `next build` pass.
- [ ] Run `npx eslint` on every changed file. Expected: clean.
- [ ] Merge proof: `git merge-tree --write-tree` against every open PR branch (#281, #282, #283, #285, #286, #287). Expected: clean.
- [ ] Look at it on the local app (dev database) as staff on an outline client: two buttons, Engagements active. Renaissance's Top Content: four buttons.
- [ ] Push, mark the PR ready, request Paul.
