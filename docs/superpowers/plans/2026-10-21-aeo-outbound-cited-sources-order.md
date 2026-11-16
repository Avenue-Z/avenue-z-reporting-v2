# AEO Outbound Competitive Visibility before Cited Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ryan's "Competitive Visibility page and Category Data page (to be renamed to Cited Sources) are going to be switched, so Competitive Vis page will go before it", for new reports.

**Architecture:** The default section titles become Ryan's names, with `PAGE_WORDS_V1` frozen at the v1.0 words. Editor and Settings labels name each field by its content. A stored slot marker, `section_order: 'visibility_first'`, set on every new row, makes the renderer write the Competitive Visibility section and menu item (02) before Cited Sources (03). A row without the marker renders byte for byte as today.

**Tech Stack:** TypeScript, zod 4, Vitest with jsdom and Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-21-aeo-outbound-cited-sources-order-design.md` (O1 to O4 in §3, edge cases §5, tests §6, minors §8; review log beside it).

## Global Constraints

- Branch `feat/aeo-outbound-cited-sources-order` off `dev` (`5fedaa52`). The PR targets `dev`, opens as a **draft with no reviewer**, and waits with the rest of round 3. Nothing merges without my "merge".
- Names exactly `Cited Sources` and `Competitive Visibility`. Labels exactly `Sources section title`, `Visibility section title`, `Domain types chart title`, `Visibility chart title`.
- Marker exactly `section_order: 'visibility_first'`. Section ids, CSS, bullets, charts, `PAGE_KEYS`, `SENTENCES_VERSION` and AIVx files unchanged. `v1-compat.test.ts` passes unchanged.
- No code writes live settings. Staging and production titles change only by an admin edit in Settings after merge.
- Writing: no em or en dashes; sentence case in prose; first person.
- Git: `git status --porcelain` before every commit; named files only; push after every commit. Bound long commands with `perl -e 'alarm N; exec @ARGV' --` and give the tool a matching timeout.

## Review Focus

1. **A draft made before this ships** (no marker) renders byte for byte as today. Pinned by `v1-compat.test.ts` and the no-marker order test (Task 2).
2. **An edit to a marker row** (text, bullet add or remove) keeps the marker, so the order never flips mid-draft. Pinned in Task 2 (`slots.test.ts`).
3. **The menu after the swap**: 04 and 05 stay after both data items. Pinned by the full sequence test (Task 2).
4. **The scroll highlight** on a marker row follows the new page order. Pinned by the frame test (Task 2).
5. **Settings where a row is saved** still hold the old titles: only the order changes until an admin edits them. Stated in the PR; not testable in code.

---

### Task 1: The names and the labels (spec O2, O4, §8 r1-10)

**Files:**
- Modify: `lib/aeo-outbound/config.ts:4-5`, `:75-76`; `lib/aeo-outbound/slots.ts:1-2`; `lib/aeo-outbound/labels.ts:11`, `:13`; `components/aeo-outbound/messages.ts:136-137`
- Test: `lib/aeo-outbound/config.test.ts:2`, `:5`; `lib/aeo-outbound/settings.test.ts:15`; `lib/aeo-outbound/labels.test.ts` (new test after `:24`); `components/aeo-outbound/settings-form.test.tsx` (labels, `:34`, `:123`)

**Interfaces:**
- Produces: nothing Task 2 consumes.

- [ ] **Step 1: Write the failing tests**

`lib/aeo-outbound/config.test.ts`: line 2 becomes `import { DECISIONS, PAGE_WORDS_V1, SENTENCES_VERSION } from './config'`; line 5 becomes:

```ts
  expect(DECISIONS.sectionTitles).toEqual(['Cited Sources', 'Competitive Visibility'])
  expect([PAGE_WORDS_V1.section_1_title, PAGE_WORDS_V1.section_2_title]).toEqual(['Category data', 'Competitive visibility'])
```

`lib/aeo-outbound/settings.test.ts:15`: in the expected `SETTINGS_DEFAULTS`, `sectionTitles: ['Category data', 'Competitive visibility']` becomes `sectionTitles: ['Cited Sources', 'Competitive Visibility']`.

`lib/aeo-outbound/labels.test.ts`, after the test ending at `:24`:

```ts
test('round 3: the section and chart fields are named by their content, since new rows swap their order', () => {
  expect(fieldLabel('page.section_1_title', T)).toBe('Sources section title')
  expect(fieldLabel('page.section_2_title', T)).toBe('Visibility section title')
  expect(fieldLabel('page.chart_1_title', T)).toBe('Domain types chart title')
  expect(fieldLabel('page.chart_2_title', T)).toBe('Visibility chart title')
})
```

`components/aeo-outbound/settings-form.test.tsx`: every `'First section title'` becomes `'Sources section title'` and every `'Second section title'` becomes `'Visibility section title'`; `:34` expects `toHaveValue('Cited Sources')`; `:123` types back `'Cited Sources'` (the default the form starts from, `SETTINGS_DEFAULTS` at `:13`).

- [ ] **Step 2: Run them to verify they fail**

Run: `perl -e 'alarm 120; exec @ARGV' -- npx vitest run lib/aeo-outbound/config.test.ts lib/aeo-outbound/settings.test.ts lib/aeo-outbound/labels.test.ts components/aeo-outbound/settings-form.test.tsx`
Expected: FAIL: the config defaults test, the settings defaults test, the new labels test, and every settings-form test that finds a field by its label (no element with the new label text). Every other test passes.

- [ ] **Step 3: Implement**

`lib/aeo-outbound/config.ts:4-5` becomes:

```ts
  /** Q1: titles of the two data sections: first the sources section (the Domain Types donut), then the competitive
   *  visibility section (the bars). Round 3 (Ryan, 2026-10-21): renamed, and new rows show the visibility section first. */
  sectionTitles: ['Cited Sources', 'Competitive Visibility'] as readonly [string, string],
```

`lib/aeo-outbound/config.ts:75-76` become:

```ts
  // The v1.0 words, frozen: DECISIONS.sectionTitles changed in round 3, and a row from before v1.1 keeps these.
  section_1_title: 'Category data',
  section_2_title: 'Competitive visibility',
```

`lib/aeo-outbound/slots.ts:1-2`: "competitive_bullets holds the first data section (strengths) and // sources_bullets the second (gaps), as spec §5 rows 5-6 say." becomes "competitive_bullets holds the sources section's box (beside the Domain Types donut) and // sources_bullets the competitive visibility section's (beside the bars), whatever their order on the page." Keep the rest of the comment.

`lib/aeo-outbound/labels.ts:11`: `section_1_title: 'First section title', section_2_title: 'Second section title'` become `section_1_title: 'Sources section title', section_2_title: 'Visibility section title'`. `:13`: `chart_1_title: 'First chart title', chart_2_title: 'Second chart title'` become `chart_1_title: 'Domain types chart title', chart_2_title: 'Visibility chart title'`.

`components/aeo-outbound/messages.ts:136-137` become:

```ts
export const FIRST_SECTION = 'Sources section title'
export const SECOND_SECTION = 'Visibility section title'
```

- [ ] **Step 4: Run them to verify they pass**

Run: `perl -e 'alarm 200; exec @ARGV' -- npx vitest run lib/aeo-outbound components/aeo-outbound app/actions app/tools`
Expected: PASS, every file (`v1-compat.test.ts` included).

- [ ] **Step 5: Commit and push**

```bash
git status --porcelain
git add lib/aeo-outbound/config.ts lib/aeo-outbound/slots.ts lib/aeo-outbound/labels.ts components/aeo-outbound/messages.ts lib/aeo-outbound/config.test.ts lib/aeo-outbound/settings.test.ts lib/aeo-outbound/labels.test.ts components/aeo-outbound/settings-form.test.tsx
git commit -m "New reports default to Cited Sources and Competitive Visibility; fields are named by content (Ryan, round 3)

PAGE_WORDS_V1 keeps the v1.0 words, so rows from before v1.1 do not change. Where a settings row is
saved, it still wins until an admin edits it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 2: Competitive Visibility first on new rows (spec O1, §5, §6, §8 r1-3 to r1-6)

**Files:**
- Modify: `lib/aeo-outbound/slots.ts` (`Slots`, after `kpis?: Kpi[]` at `:35`), `lib/aeo-outbound/contracts.ts:175`, `lib/aeo-outbound/generate.ts:101`, `lib/aeo-outbound/render.ts:225`, `:238-239`, `:265-280`
- Test: `lib/aeo-outbound/render.test.ts` (after `:100`), `lib/aeo-outbound/render.frame.test.ts:323-337` and a new test after `:370`, `lib/aeo-outbound/contracts.test.ts` (after `:202`), `lib/aeo-outbound/generate.test.ts:278`, `lib/aeo-outbound/slots.test.ts` (after the structure test ending near `:171`)

**Interfaces:**
- Produces: `Slots.section_order?: 'visibility_first'`; `STORED_SLOTS.section_order: z.literal('visibility_first').optional()`.

- [ ] **Step 1: Write the failing tests**

`lib/aeo-outbound/render.test.ts`, after the test ending at `:100`:

```ts
const VIS_FIRST: Slots = { ...SLOTS, section_order: 'visibility_first' }
const menuOf = (doc: Document) => [...doc.querySelectorAll('.sidebar-nav a')].map((a) => [a.getAttribute('href'), a.querySelector('.nav-num')!.textContent])
const sectionIds = (doc: Document) => [...doc.querySelectorAll('section[id]')].map((e) => e.id)

test('round 3: a row with the marker lists Competitive Visibility at 02 and Cited Sources at 03, in the menu and on the page, in every mode', () => {
  for (const mode of ['final', 'preview', 'draft'] as const) {
    const doc = parse(renderSnapshotHtml(DATA, VIS_FIRST, mode, 'x'))
    expect(menuOf(doc)).toEqual([['#headline', '01'], ['#competitive-visibility', '02'], ['#category-data', '03'], ['#opportunities', '04'], ['#methodology', '05']])
    expect(sectionIds(doc)).toEqual(['headline', 'competitive-visibility', 'category-data', 'opportunities', 'methodology'])
    expect(doc.querySelector('#competitive-visibility .section-label')!.textContent).toMatch(/^02 \/ /)
    expect(doc.querySelector('#category-data .section-label')!.textContent).toMatch(/^03 \/ /)
  }
})

test('round 3: with the marker each section keeps its own title, bullets and chart, and the menu copies follow the page', () => {
  const doc = parse(renderSnapshotHtml(DATA, VIS_FIRST, 'draft', 'x'))
  const cv = doc.getElementById('competitive-visibility')!
  const cd = doc.getElementById('category-data')!
  expect(cv.querySelector('h2')!.getAttribute('data-slot')).toBe('page.section_2_title')
  expect(cv.querySelector('[data-slot="sources_bullets.0.lead"]')).not.toBeNull()
  expect(cv.querySelector('[data-slot="page.chart_2_title"]')).not.toBeNull()
  expect(cd.querySelector('h2')!.getAttribute('data-slot')).toBe('page.section_1_title')
  expect(cd.querySelector('[data-slot="competitive_bullets.0.lead"]')).not.toBeNull()
  expect(cd.querySelector('[data-slot="page.chart_1_title"]')).not.toBeNull()
  expect([...doc.querySelectorAll('[data-mirror-edit]')].map((e) => e.getAttribute('data-mirror'))).toEqual(['page.headline_label', 'page.section_2_title', 'page.section_1_title', 'page.opps_label'])
})

test('round 3: a row without the marker keeps today\'s order', () => {
  const doc = parse(renderSnapshotHtml(DATA, SLOTS, 'final', 'x'))
  expect(menuOf(doc)).toEqual([['#headline', '01'], ['#category-data', '02'], ['#competitive-visibility', '03'], ['#opportunities', '04'], ['#methodology', '05']])
  expect(sectionIds(doc)).toEqual(['headline', 'category-data', 'competitive-visibility', 'opportunities', 'methodology'])
})
```

(`parse` and `Slots` are already in the file, `render.test.ts:8`, `:212`.)

`lib/aeo-outbound/render.frame.test.ts:323-337`: `bootSpy` takes the row and the section order. Replace the `SECTION_IDS` line and the first two lines of `bootSpy` with:

```ts
const SECTION_IDS = ['headline', 'category-data', 'competitive-visibility', 'opportunities', 'methodology']
function bootSpy(mode: RenderMode, o: { bottom: boolean; tops?: number[]; edit?: boolean; slots?: Slots; ids?: string[] }) {
  doc = new DOMParser().parseFromString(renderSnapshotHtml(V1_DATA, o.slots ?? V1_SLOTS, mode, 'Oct 8, 2026'), 'text/html')
```

and `SECTION_IDS.forEach((id, i) => {` becomes `(o.ids ?? SECTION_IDS).forEach((id, i) => {`. After the test ending at `:370`, add:

```ts
test('round 3: on a row with Competitive Visibility first, the scroll highlight follows the page order', () => {
  // Tops follow the marker row's page order. With today's DOM order AIVx would visit Competitive Visibility last and pick it.
  bootSpy('final', { bottom: false, slots: { ...V1_SLOTS, section_order: 'visibility_first' }, ids: ['headline', 'competitive-visibility', 'category-data', 'opportunities', 'methodology'] })
  win.dispatchEvent(new Event('scroll'))
  expect(actives()).toEqual(['#category-data'])
})
```

`lib/aeo-outbound/contracts.test.ts`, after the test ending at `:202`:

```ts
test('round 3: the stored slots accept the page-order marker, refuse another value, and read a row without it', () => {
  expect(checkContract('stored.slots', STORED_SLOTS, { ...V1_SLOTS, section_order: 'visibility_first' }, 'enforce')).toEqual({ ok: true })
  expect(checkContract('stored.slots', STORED_SLOTS, { ...V1_SLOTS, section_order: 'sources_first' }, 'enforce').ok).toBe(false)
  expect(checkContract('stored.slots', STORED_SLOTS, V1_SLOTS, 'enforce')).toEqual({ ok: true })
})
```

`lib/aeo-outbound/generate.test.ts:278`, after that line add:

```ts
  expect(r.slots.section_order).toBe('visibility_first')
```

`lib/aeo-outbound/slots.test.ts`, after the structure test (the one ending with the `STRUCTURE_ERRORS` expectation):

```ts
test('round 3: every save keeps the page-order marker, and a row without it never gains one', () => {
  const marked = withDefaults({ ...S0, section_order: 'visibility_first' }, DATA_STUB)
  expect(marked.section_order).toBe('visibility_first')
  const edited = applySlotPatch(marked, 'headline', 'New headline')
  expect(edited.ok && edited.slots.section_order).toBe('visibility_first')
  const added = applyStructure(marked, 'sources_bullets.add', 'structure')
  expect(added.ok && added.slots.section_order).toBe('visibility_first')
  const removed = added.ok ? applyStructure(added.slots, 'sources_bullets.0.remove', 'structure') : null
  expect(removed?.ok && removed.slots.section_order).toBe('visibility_first')
  const plain = applySlotPatch(S, 'headline', 'New headline')
  expect(plain.ok && 'section_order' in plain.slots).toBe(false)
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `perl -e 'alarm 200; exec @ARGV' -- npx vitest run lib/aeo-outbound/render.test.ts lib/aeo-outbound/render.frame.test.ts lib/aeo-outbound/contracts.test.ts lib/aeo-outbound/generate.test.ts lib/aeo-outbound/slots.test.ts`
Expected: FAIL: the two marker render tests (today's order), the frame test (`#competitive-visibility` active), the contracts test (`sources_first` accepted, since `STORED_SLOTS` is a loose object), and the generate test (no marker). The no-marker render test and the slots test **pass** today: they guard behaviour that must not change (the slots test proves the save path already carries an unknown key). TypeScript may flag `section_order` on `Slots` until Step 3; vitest still runs. Every other test passes.

- [ ] **Step 3: Implement**

`lib/aeo-outbound/slots.ts`, in `Slots` after `kpis?: Kpi[]`:

```ts
  /** Round 3 (Ryan, 2026-10-21): every row generated since the page swap; absent reads today's order (Cited Sources first). */
  section_order?: 'visibility_first'
```

`lib/aeo-outbound/contracts.ts`, in `STORED_SLOTS` after the `page:` line (`:175`):

```ts
  // Round 3 (Ryan, 2026-10-21): the page-order marker; absent reads today's order.
  section_order: z.literal('visibility_first').optional(),
```

`lib/aeo-outbound/generate.ts:101` becomes:

```ts
      const full: FullSlots = { ...withDefaults(checked.slots, data), page: pageDefaults(settings), section_order: 'visibility_first' }
```

`lib/aeo-outbound/render.ts`, directly after `const chartMark = attr('data-locked', 'chart')` (`:225`; `fixedMark`, `slot`, `mirror` and `fixed` are defined above it at `:179-191`):

```ts
  // Round 3 (Ryan, 2026-10-21): a row generated since the swap shows Competitive Visibility (02) before Cited Sources (03).
  // Each section keeps its id, title, bullet box and chart, and the menu items after them stay after both. A row without
  // the marker is byte-identical to before.
  const visFirst = s.section_order === 'visibility_first'
  const [n1, n2] = visFirst ? ['03', '02'] : ['02', '03']
  const nav1 = `<a href="#category-data"><span class="nav-num"${fixedMark}>${n1}</span> ${mirror('page.section_1_title', t1, false, true)}</a>`
  const nav2 = `<a href="#competitive-visibility"><span class="nav-num"${fixedMark}>${n2}</span> ${mirror('page.section_2_title', t2, false, true)}</a>`
  const section1 = `<section id="category-data" class="section">
  <div class="section-label">${fixed(`${n1} / `)}${mirror('page.section_1_title', t1)}</div>
  ${slot('h2', 'page.section_1_title', t1, 'section-title')}
  <div class="two-col" style="margin-top:16px;align-items:stretch">
    <div><div class="insight-box">${bullets('competitive_bullets')}</div></div>
    <div><div class="chart-wrap">${slot('div', 'page.chart_1_title', p.chart_1_title, 'chart-title')}${embedFigure('aeo-chart-sources', sourceDonutFigure(data.sourceMix), chartMark)}</div></div>
  </div>
</section>`
  const section2 = `<section id="competitive-visibility" class="section">
  <div class="section-label">${fixed(`${n2} / `)}${mirror('page.section_2_title', t2)}</div>
  ${slot('h2', 'page.section_2_title', t2, 'section-title')}
  <div class="two-col" style="margin-top:16px;align-items:stretch">
    <div><div class="insight-box">${bullets('sources_bullets')}</div></div>
    <div><div class="chart-wrap">${slot('div', 'page.chart_2_title', p.chart_2_title, 'chart-title')}${embedFigure('aeo-chart-visibility', visibilityBarFigure(shownBrands), chartMark)}</div></div>
  </div>
</section>`
  const [firstNav, secondNav] = visFirst ? [nav2, nav1] : [nav1, nav2]
  const [firstSection, secondSection] = visFirst ? [section2, section1] : [section1, section2]
```

In the sidebar, `:238-239` (the two data menu lines) become:

```ts
    ${firstNav}
    ${secondNav}
```

In `main`, `:265-280` (from `<section id="category-data"` to the `</section>` closing `#competitive-visibility`) become:

```ts
${firstSection}
${secondSection}
```

- [ ] **Step 4: Run them to verify they pass, with the byte-for-byte pin**

Run: `perl -e 'alarm 200; exec @ARGV' -- npx vitest run lib/aeo-outbound/render.test.ts lib/aeo-outbound/render.frame.test.ts lib/aeo-outbound/contracts.test.ts lib/aeo-outbound/generate.test.ts lib/aeo-outbound/slots.test.ts lib/aeo-outbound/v1-compat.test.ts`
Expected: PASS, every test in the six files. `v1-compat.test.ts:76` proves a row without the marker is byte-identical.

- [ ] **Step 5: Commit and push**

```bash
git status --porcelain
git add lib/aeo-outbound/slots.ts lib/aeo-outbound/contracts.ts lib/aeo-outbound/generate.ts lib/aeo-outbound/render.ts lib/aeo-outbound/render.test.ts lib/aeo-outbound/render.frame.test.ts lib/aeo-outbound/contracts.test.ts lib/aeo-outbound/generate.test.ts lib/aeo-outbound/slots.test.ts
git commit -m "New reports show Competitive Visibility (02) before Cited Sources (03) (Ryan, round 3)

A stored marker, section_order: 'visibility_first', set on every new row. Each section keeps its id,
title, bullets and chart; the menu items after them stay after both. A row without the marker renders
byte for byte as before (v1-compat).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 3: Whole suite, final review, draft PR

- [ ] **Step 1: Checks.** `npm test` (to a file in the plan workspace, alarm 500 and a matching tool timeout), `npm run typecheck`, and `npx eslint` on the changed files. Expected: all tests pass; typecheck clean; changed files add no lint error.
- [ ] **Step 2: Final review.** Fresh reviewer (`opus`) over `5fedaa52..HEAD` with the spec, this plan and the Review Focus. Critical and Important get one fix pass, RED then GREEN; minors listed in the PR.
- [ ] **Step 3: Draft PR to `dev`, no reviewer.** Title `AEO Outbound: Competitive Visibility before Cited Sources → dev`. The body, in first person, states: Ryan's words; what new reports show; that drafts in flight and approved reports do not change; the Settings edit needed on staging and production after merge (first "Cited Sources", second "Competitive Visibility"), unverified what they hold now; that the Cited Sources box keeps today's bullets until Q1; the overlaps with #411 (its Opportunities link must attach after the pair, and the hidden-page sequence test goes in whichever merges second), #412 (`generate.ts:101-102`, `labels.ts`) and #413; the raw checks output; deferred minors.
