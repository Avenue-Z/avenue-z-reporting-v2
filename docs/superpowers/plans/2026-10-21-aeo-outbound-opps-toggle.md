# AEO Outbound Opportunities page toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A sales person can turn a draft's Opportunities page on or off from the editor toolbar; off, the page leaves the section out in every mode, Methodology becomes 04, and hidden text is never validated or grounded.

**Architecture:** One optional top-level slots key, `opportunities_page`, set by two new structural save paths through the existing slots route. `slotEntries` skips hidden paths, which carries the Approve gate and grounding with it. The renderer leaves the menu item and section out. The editor gets one toolbar button that sends the structural save.

**Tech Stack:** TypeScript, Next.js 16, React 19, zod 4, Vitest with jsdom and Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-21-aeo-outbound-opps-toggle-design.md` (review log beside it; §9 and §10 list the minors this plan covers).

## Global Constraints

- Branch `feat/aeo-outbound-opps-toggle` off `dev`. The PR targets `dev`, is opened as a **draft with no reviewer**, and waits with the rest of round 3 until Thomas says to send the set to Paul. Nothing merges without Thomas's "merge".
- Stored key: `opportunities_page?: 'shown' | 'hidden'`, top level of `slots`, never under `page`. Absent means shown.
- Structural paths exactly `opportunities_page.hide` and `opportunities_page.show`; the value is the literal `"structure"` as for bullets.
- Button text exactly "Opportunities page: on" and "Opportunities page: off", right before Approve, no `aria-pressed`.
- Shown pages render byte-identical to today (`v1-compat.test.ts` must pass unchanged).
- No migration, no change to the prompt, the reply contract, generation, `PAGE_KEYS`, settings, AIVx files or the charts.
- Writing: no em or en dashes; sentence case; first person.
- Git: `git status --porcelain` before every commit; add named files only; push after every commit. Bound long commands with `perl -e 'alarm N; exec @ARGV' --`.

## Review Focus

1. **A click that lands before React re-renders a frame `dirty` message** (spec r2-1): the click must read the queue's live state, or a hide can bury a refused cell and lock the editor. Pinned in Task 3.
2. **A row an older build saved after it was hidden**: the old `withDefaults` spreads the key back (`slots.ts:82-83`), so the row stays hidden for this build. Pinned in Task 1 (`withDefaults` reads a stored `'hidden'`).
3. **Approve of a hidden report** must freeze a page without the section and with Methodology 04, even with "Needs validation" in the hidden text. Pinned in Task 2.
4. **The brand-changed count** must not count text the prospect will not see. Covered by `slotEntries` skipping hidden paths (Task 1), which `grounding.ts:253-255` reads.
5. **Two tabs**: a stale tab's toggle is a 409 and its queue stops. Pinned in Task 1 (route) and Task 3 (button unchanged after 409).

---

### Task 1: The stored switch, its save paths, and what is checked (spec S1, S2, S5)

**Files:**
- Modify: `lib/aeo-outbound/slots.ts:21-39`, `:50`, `:80-84`, `:115-146`
- Modify: `lib/aeo-outbound/contracts.ts:168-176`
- Test: `lib/aeo-outbound/slots.test.ts`, `lib/aeo-outbound/contracts.test.ts`, `lib/aeo-outbound/labels.test.ts`, `lib/aeo-outbound/grounding.test.ts`, `components/aeo-outbound/save-queue.test.ts`, `app/api/aeo-outbound/reports/[id]/slots/route.test.ts`

**Interfaces:**
- Produces: `Slots.opportunities_page?: 'shown' | 'hidden'`; `FullSlots.opportunities_page: 'shown' | 'hidden'`; exports `OPPS_HIDE = 'opportunities_page.hide'`, `OPPS_SHOW = 'opportunities_page.show'`, `OPPS_PAGE_KEYS` (the six page keys). Tasks 2 and 3 read these.

- [ ] **Step 1: Write the failing tests**

`lib/aeo-outbound/slots.test.ts`: add `OPPS_PAGE_KEYS` to the import on line 2, then append:

```ts
test('Opportunities page switch: absent reads shown; hide and show are structural, repeatable and need text (Ryan, round 3)', () => {
  expect(S.opportunities_page).toBe('shown')
  expect(withDefaults({ ...S0, opportunities_page: 'hidden' }, DATA_STUB).opportunities_page).toBe('hidden')
  for (const p of ['opportunities_page.hide', 'opportunities_page.show']) expect(isStructuralPath(p)).toBe(true)
  for (const p of ['opportunities.hide', 'opportunities_page', 'opportunities_page.toggle', 'opportunities_page.0.remove']) expect(isStructuralPath(p)).toBe(false)
  const hidden = applyStructure(S, 'opportunities_page.hide', 'structure')
  expect(hidden.ok && hidden.slots.opportunities_page).toBe('hidden')
  expect(hidden.ok && hidden.slots.opportunities).toEqual(S.opportunities)
  const again = hidden.ok ? applyStructure(hidden.slots, 'opportunities_page.hide', 'structure') : null
  expect(again?.ok && again.slots).toEqual(hidden.ok && hidden.slots)
  const shown = hidden.ok ? applyStructure(hidden.slots, 'opportunities_page.show', 'structure') : null
  expect(shown?.ok && shown.slots).toEqual(S)
  expect(applyStructure(S, 'opportunities_page.hide', '')).toEqual({ ok: false, error: "This field can't be empty." })
  expect(S.opportunities_page).toBe('shown')
})

const HIDDEN_PATHS = [...[0, 1, 2].flatMap((i) => ['signal', 'opportunity', 'workstream'].map((k) => `opportunities.${i}.${k}`)), ...OPPS_PAGE_KEYS.map((k) => `page.${k}`)]
test('a hidden Opportunities page leaves exactly its 15 paths out of slotEntries, so Needs validation there no longer blocks', () => {
  expect(OPPS_PAGE_KEYS).toEqual(['opps_label', 'opps_title', 'opps_col_1', 'opps_col_2', 'opps_col_3', 'opps_takeaway'])
  const marked = { ...S, opportunities: S.opportunities.map(() => ({ signal: 'Needs validation', opportunity: 'o', workstream: 'w' })), page: { ...S.page, opps_title: 'Needs validation' } }
  expect(needsValidationPaths(marked)).toEqual(['opportunities.0.signal', 'opportunities.1.signal', 'opportunities.2.signal', 'page.opps_title'])
  const hidden = { ...marked, opportunities_page: 'hidden' as const }
  expect(needsValidationPaths(hidden)).toEqual([])
  const shownPaths = slotEntries(marked).map(([p]) => p)
  const hiddenPaths = slotEntries(hidden).map(([p]) => p)
  expect(shownPaths.filter((p) => !hiddenPaths.includes(p)).sort()).toEqual([...HIDDEN_PATHS].sort())
  expect(hiddenPaths.every((p) => shownPaths.includes(p))).toBe(true)
})
```

`lib/aeo-outbound/contracts.test.ts`, append:

```ts
test('stored slots: opportunities_page is absent, shown or hidden; anything else breaks the contract (Ryan, round 3)', () => {
  for (const v of [undefined, 'shown', 'hidden']) expect(checkContract('stored.slots', STORED_SLOTS, { ...V1_SLOTS, ...(v ? { opportunities_page: v } : {}) }, 'enforce')).toEqual({ ok: true })
  for (const v of ['off', true, null, 1]) expect(checkContract('stored.slots', STORED_SLOTS, { ...V1_SLOTS, opportunities_page: v }, 'enforce').ok).toBe(false)
})
```

`lib/aeo-outbound/labels.test.ts`, append:

```ts
test('every editable path of a hidden Opportunities page still has a label', () => {
  for (const [p] of slotEntries({ ...FULL, opportunities_page: 'hidden' })) expect(fieldLabel(p, T), p).not.toBe(p)
})
```

`lib/aeo-outbound/grounding.test.ts`, append:

```ts
test('a hidden Opportunities page is not checked: its numbers flag nothing until it is shown again (Ryan, round 3)', () => {
  const d = newRow()
  const opps = [0, 1, 2].map((i) => ({ signal: `Grew 40% in quarter ${i}`, opportunity: 'Explore it', workstream: 'Content' }))
  expect(flagsFor(d, { opportunities: opps }).some((n) => n.path?.startsWith('opportunities.'))).toBe(true)
  expect(flagsFor(d, { opportunities: opps, opportunities_page: 'hidden' })).toEqual([])
})
```

`components/aeo-outbound/save-queue.test.ts`, append (a pin on existing queue behaviour for the new path; it may pass before the implementation, which is expected because the queue code does not change):

```ts
test('a structural save of the Opportunities page switch keeps opportunities.* errors and dirt (spec §9 m10)', async () => {
  const send = vi.fn(async (p: string, _v: string, r: number): Promise<SendResult> =>
    p === 'opportunities.0.signal' ? { kind: 'bad', error: 'Too long.' } : { kind: 'ok', revision: r + 1 })
  const q = new SaveQueue(send, 1, () => {})
  q.markDirty('opportunities.0.signal'); q.edit('opportunities.0.signal', 'x')
  await flush()
  expect(q.state.badPaths).toEqual(['opportunities.0.signal'])
  q.markDirty('opportunities.1.signal')
  q.structure('opportunities_page.hide')
  await flush()
  expect(send.mock.calls.at(-1)?.slice(0, 2)).toEqual(['opportunities_page.hide', 'structure'])
  expect(q.state.badPaths).toEqual(['opportunities.0.signal'])
  expect(q.state.dirty).toBe(true)
})
```

`app/api/aeo-outbound/reports/[id]/slots/route.test.ts`, append:

```ts
test('Opportunities page switch: hide and show are structural 200s with slots; needsValidation leaves out hidden text; a stale revision is 409 (Ryan, round 3)', async () => {
  m.getReport.mockResolvedValue(row({ slots: { ...SLOTS, page: { opps_title: 'Needs validation' } } }))
  const hide = await patch({ path: 'opportunities_page.hide', value: 'structure', revision: 3 })
  expect(hide.status).toBe(200)
  const body = await hide.json()
  expect(body.slots.opportunities_page).toBe('hidden')
  expect(body.needsValidation).not.toContain('page.opps_title')
  expect(m.save.mock.calls[0][2].opportunities_page).toBe('hidden')
  m.getReport.mockResolvedValue(row({ slots: { ...SLOTS, opportunities_page: 'hidden', page: { opps_title: 'Needs validation' } } }))
  const show = await patch({ path: 'opportunities_page.show', value: 'structure', revision: 3 })
  expect(show.status).toBe(200)
  expect((await show.json()).needsValidation).toContain('page.opps_title')
  const stale = await patch({ path: 'opportunities_page.hide', value: 'structure', revision: 2 })
  expect(stale.status).toBe(409)
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `perl -e 'alarm 200; exec @ARGV' -- npx vitest run lib/aeo-outbound/slots.test.ts lib/aeo-outbound/contracts.test.ts lib/aeo-outbound/labels.test.ts lib/aeo-outbound/grounding.test.ts components/aeo-outbound/save-queue.test.ts 'app/api/aeo-outbound/reports/[id]/slots/route.test.ts'`
Expected: FAIL. `OPPS_PAGE_KEYS` is not exported (slots test import), the contract accepts `'off'`, grounding flags the hidden numbers, the route answers 400 unknown field for `opportunities_page.hide`. The labels and save-queue pins may already pass.

- [ ] **Step 3: Write the implementation**

`lib/aeo-outbound/slots.ts`:

In `interface Slots` (after `page?: Partial<PageWords>`, line 36) add:

```ts
  /** Round 3 (Ryan, 2026-10-21): the Opportunities page per report. Absent reads shown, so every older row is unchanged. */
  opportunities_page?: 'shown' | 'hidden'
```

Line 39 becomes:

```ts
export type FullSlots = Omit<Slots, 'brand' | 'window_label' | 'kpis' | 'page' | 'opportunities_page'> & { brand: string; window_label: string; kpis: Kpi[]; page: PageWords; opportunities_page: 'shown' | 'hidden' }
```

Line 50-51 become:

```ts
const STRUCTURE = /^(?:(competitive_bullets|sources_bullets)\.(?:add|([0-5])\.remove)|opportunities_page\.(hide|show))$/
export const isStructuralPath = (path: string): boolean => STRUCTURE.test(path)
/** Round 3: turn the Opportunities page off or on. The first segment is no prefix of any text path, so the save queue's
 *  structural cleanup (save-queue.ts) drops nothing else. */
export const OPPS_HIDE = 'opportunities_page.hide'
export const OPPS_SHOW = 'opportunities_page.show'
/** The page words that sit on the Opportunities page, left out of slotEntries while it is hidden. */
export const OPPS_PAGE_KEYS = ['opps_label', 'opps_title', 'opps_col_1', 'opps_col_2', 'opps_col_3', 'opps_takeaway'] as const satisfies readonly PageKey[]
```

`withDefaults` (lines 80-84) becomes:

```ts
/** Every key filled. Missing keys read the row's own data (brand, window label, KPIs), the v1.0 words, and a shown
 *  Opportunities page. Never mutates. */
export function withDefaults(s: Slots, d: { brand: string; windowLabel: string; kpis: Kpi[] }): FullSlots {
  const { brand, window_label, kpis, page, opportunities_page, ...copy } = structuredClone(s)
  return { ...copy, brand: brand ?? d.brand, window_label: window_label ?? d.windowLabel, kpis: kpis ?? structuredClone(d.kpis), page: { ...V1_WORDS, ...(page ?? {}) }, opportunities_page: opportunities_page === 'hidden' ? 'hidden' : 'shown' }
}
```

In `applyStructure`, replace the comment above it and its body after `const next: FullSlots = structuredClone(slots)` (lines 112-131) so it reads:

```ts
/** Add a bullet to a list shorter than MAX_BULLETS, or remove one from a list longer than MIN_BULLETS (v1.1 §3, 18.12),
 *  or turn the Opportunities page off or on (round 3; setting it to the state it has is a no-op). A remove checks its
 *  index first: one at or past the end is unknown field. value is the literal "structure": ignored, but it must be
 *  non-empty text, so the §9a rule holds for every PATCH. */
export function applyStructure(slots: FullSlots, path: string, raw: unknown): { ok: true; slots: FullSlots } | { ok: false; error: string } {
  const m = STRUCTURE.exec(path)
  if (!m) return { ok: false, error: 'unknown field' }
  const checked = checkValue(raw, MAX_VALUE)
  if (!checked.ok) return checked
  const next: FullSlots = structuredClone(slots)
  if (m[3]) {
    next.opportunities_page = m[3] === 'hide' ? 'hidden' : 'shown'
    return { ok: true, slots: next }
  }
  const list = next[m[1] as 'competitive_bullets' | 'sources_bullets']
```

(the rest of the function, from `if (m[2] === undefined) {` on, is unchanged).

`slotEntries` (lines 134-143) becomes:

```ts
/** Every [path, value] on the page, in page order: the copy as v1.0 listed it, then brand, window label, KPIs and page
 *  words. A hidden Opportunities page leaves out its rows and its six page words (round 3). */
export function slotEntries(s: FullSlots): [string, string][] {
  const shown = s.opportunities_page !== 'hidden'
  const out: [string, string][] = SCALARS.map((k) => [k, s[k]])
  for (const list of ['competitive_bullets', 'sources_bullets'] as const) s[list].forEach((b, i) => { out.push([`${list}.${i}.lead`, b.lead], [`${list}.${i}.text`, b.text]) })
  if (shown) s.opportunities.forEach((o, i) => { out.push([`opportunities.${i}.signal`, o.signal], [`opportunities.${i}.opportunity`, o.opportunity], [`opportunities.${i}.workstream`, o.workstream]) })
  out.push(['brand', s.brand], ['window_label', s.window_label])
  s.kpis.forEach((k, i) => { out.push([`kpis.${i}.label`, k.label], [`kpis.${i}.value`, k.value]) })
  const skip: readonly string[] = shown ? [] : OPPS_PAGE_KEYS
  for (const k of PAGE_KEYS) if (!skip.includes(k)) out.push([`page.${k}`, s.page[k]])
  return out
}
```

`lib/aeo-outbound/contracts.ts`, in `STORED_SLOTS` after the `page:` line (175) add:

```ts
  // Round 3 (Ryan, 2026-10-21): the Opportunities page switch; absent reads shown.
  opportunities_page: z.enum(['shown', 'hidden']).optional(),
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `perl -e 'alarm 200; exec @ARGV' -- npx vitest run lib/aeo-outbound/slots.test.ts lib/aeo-outbound/contracts.test.ts lib/aeo-outbound/labels.test.ts lib/aeo-outbound/grounding.test.ts components/aeo-outbound/save-queue.test.ts 'app/api/aeo-outbound/reports/[id]/slots/route.test.ts' lib/aeo-outbound/v1-compat.test.ts`
Expected: PASS. If an existing test compares a full `withDefaults` result with a literal object, it now needs `opportunities_page: 'shown'` added to its literal: ledger a ruling for each such line.

- [ ] **Step 5: Commit and push**

```bash
git status --porcelain
git add lib/aeo-outbound/slots.ts lib/aeo-outbound/contracts.ts lib/aeo-outbound/slots.test.ts lib/aeo-outbound/contracts.test.ts lib/aeo-outbound/labels.test.ts lib/aeo-outbound/grounding.test.ts components/aeo-outbound/save-queue.test.ts 'app/api/aeo-outbound/reports/[id]/slots/route.test.ts'
git commit -m "Opportunities page switch: stored key, hide and show saves, hidden text left unchecked (Ryan, round 3)"
perl -e 'alarm 30; exec @ARGV' -- git push
```

---

### Task 2: Render without the page, Methodology as 04 (spec S4)

**Files:**
- Modify: `lib/aeo-outbound/render.ts:225-241`, `:286-299`
- Test: `lib/aeo-outbound/render.test.ts`, `lib/aeo-outbound/render.frame.test.ts:324-338`, `app/actions/aeo-outbound.test.ts`

**Interfaces:**
- Consumes: `Slots.opportunities_page` from Task 1 (read off `s`, the `withDefaults` result inside `renderSnapshotHtml`).

- [ ] **Step 1: Write the failing tests**

`lib/aeo-outbound/render.test.ts`, append:

```ts
const HIDDEN: Slots = { ...SLOTS, opportunities_page: 'hidden' }
test('Opportunities page off (Ryan, round 3): no section, no menu item, Methodology is 04, Why it matters stays, in every mode', () => {
  for (const mode of ['draft', 'preview', 'final'] as const) {
    const h = renderSnapshotHtml(DATA, HIDDEN, mode, 'Oct 8, 2026')
    const doc = parse(h)
    expect(doc.getElementById('opportunities'), mode).toBeNull()
    expect(doc.querySelector('a[href="#opportunities"]'), mode).toBeNull()
    expect([...doc.querySelectorAll('.sidebar-nav .nav-num')].map((e) => e.textContent), mode).toEqual(['01', '02', '03', '04'])
    expect(doc.querySelector('#methodology .section-label')!.textContent, mode).toMatch(/^04 \/ /)
    expect(doc.querySelector('.rec-global-bottom-line'), mode).not.toBeNull()
    expect(h, mode).not.toContain('class="leaderboard"')
  }
})

test('Opportunities page on, stored or by default, renders the same bytes', () => {
  for (const mode of ['draft', 'preview', 'final'] as const) expect(renderSnapshotHtml(DATA, { ...SLOTS, opportunities_page: 'shown' }, mode, 'x')).toBe(renderSnapshotHtml(DATA, SLOTS, mode, 'x'))
})

test('hidden: the fixed marks, the slots and the menu copies follow the page (spec §9 m9)', () => {
  const doc = parse(renderSnapshotHtml(DATA, HIDDEN, 'draft', 'Oct 8, 2026'))
  expect([...doc.querySelectorAll('[data-locked="fixed"]')].map((e) => e.textContent)).toEqual(['01', '02', '03', '04', '02 / ', '03 / ', '04 / ', 'Oct 8, 2026'])
  const paths = [...doc.querySelectorAll('[data-slot]')].map((e) => e.getAttribute('data-slot'))
  expect(new Set(paths)).toEqual(new Set(slotEntries(withDefaults(HIDDEN, DATA)).map(([p]) => p).filter((p) => p !== 'page.sidebar_powered')))
  expect([...doc.querySelectorAll('[data-mirror-edit]')].map((e) => e.getAttribute('data-mirror'))).toEqual(['page.headline_label', 'page.section_1_title', 'page.section_2_title'])
})
```

`lib/aeo-outbound/render.frame.test.ts`: `bootSpy` (line 324) gains a `hidden` option. Its signature and first lines become:

```ts
function bootSpy(mode: RenderMode, o: { bottom: boolean; tops?: number[]; edit?: boolean; hidden?: boolean }) {
  doc = new DOMParser().parseFromString(renderSnapshotHtml(V1_DATA, o.hidden ? { ...V1_SLOTS, opportunities_page: 'hidden' as const } : V1_SLOTS, mode, 'Oct 8, 2026'), 'text/html')
  if (o.edit) doc.querySelector('[data-slot]')!.setAttribute('contenteditable', 'true')
  const ids = o.hidden ? SECTION_IDS.filter((id) => id !== 'opportunities') : SECTION_IDS
  const tops = o.tops ?? (o.hidden ? [-900, -600, 0, 400] : [-900, -600, 0, 400, 700])
  ids.forEach((id, i) => {
```

(the rest of `bootSpy` is unchanged), and append after the bootSpy tests:

```ts
test('hidden Opportunities page: the page scripts run, and at the bottom only the 04 Methodology link is active', () => {
  bootSpy('final', { bottom: true, hidden: true })
  win.dispatchEvent(new Event('scroll'))
  expect(actives()).toEqual(['#methodology'])
  expect(doc.querySelector('a[href="#methodology"] .nav-num')!.textContent).toBe('04')
})
```

`app/actions/aeo-outbound.test.ts`, append:

```ts
test('approve: a hidden Opportunities page with Needs validation in it approves, and the frozen page has no Opportunities section (Ryan, round 3)', async () => {
  vi.mocked(store.getReport).mockResolvedValueOnce({ ...DRAFT, slots: { ...SLOTS, opportunities_page: 'hidden', page: { opps_title: 'Needs validation' } } } as never)
  expect(await approveSnapshotAction(ID, 1, 'Ada')).toMatchObject({ ok: true })
  const html = vi.mocked(store.approveQuery).mock.calls[0][2].html
  expect(html).not.toContain('id="opportunities"')
  expect(html).toContain('04 / Methodology')
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `perl -e 'alarm 200; exec @ARGV' -- npx vitest run lib/aeo-outbound/render.test.ts lib/aeo-outbound/render.frame.test.ts app/actions/aeo-outbound.test.ts`
Expected: FAIL. The hidden page still has `#opportunities` and "05"; `bootSpy` hidden still finds the section; the approve test sees the section. The "same bytes" test passes already (both sides render shown).

- [ ] **Step 3: Write the implementation**

`lib/aeo-outbound/render.ts`, after `const chartMark = attr('data-locked', 'chart')` (line 225) add:

```ts
  // Round 3 (Ryan, 2026-10-21): the Opportunities page can be turned off per report. Off, its menu item and section are
  // not written and Methodology moves up to 04; on, every byte is as before.
  const oppsShown = s.opportunities_page !== 'hidden'
  const methodNum = oppsShown ? '05' : '04'
  const oppsNav = oppsShown ? `\n    <a href="#opportunities"><span class="nav-num"${fixedMark}>04</span> ${mirror('page.opps_label', p.opps_label, false, true)}</a>` : ''
  const oppsSection = oppsShown ? `
<section id="opportunities" class="section">
  <div class="section-label">${fixed('04 / ')}${wrap('page.opps_label', p.opps_label)}</div>
  ${slot('h2', 'page.opps_title', p.opps_title, 'section-title')}
  <div class="leaderboard-wrap">
    <table class="leaderboard">
      <thead><tr>${slot('th', 'page.opps_col_1', p.opps_col_1)}${slot('th', 'page.opps_col_2', p.opps_col_2)}${slot('th', 'page.opps_col_3', p.opps_col_3)}</tr></thead>
      <tbody>${s.opportunities.map((o, i) => `<tr>${slot('td', `opportunities.${i}.signal`, o.signal, '', label(p.opps_col_1))}${slot('td', `opportunities.${i}.opportunity`, o.opportunity, '', label(p.opps_col_2))}${slot('td', `opportunities.${i}.workstream`, o.workstream, '', label(p.opps_col_3))}</tr>`).join('')}</tbody>
    </table>
  </div>
  ${slot('p', 'page.opps_takeaway', p.opps_takeaway, 'chart-takeaway')}
</section>` : ''
```

In the sidebar, lines 239-241 become (line 240 is removed; its link now comes from `oppsNav`):

```ts
    <a href="#competitive-visibility"><span class="nav-num"${fixedMark}>03</span> ${mirror('page.section_2_title', t2, false, true)}</a>${oppsNav}
    <a href="#methodology"><span class="nav-num"${fixedMark}>${methodNum}</span> ${wrap('page.method_nav', p.method_nav)}</a>
```

In the page body, line 286 (`</section>` closing "Why it matters") becomes `</section>${oppsSection}`, lines 287-297 (the old `#opportunities` section) are removed, and line 299 becomes:

```ts
  <div class="section-label">${fixed(`${methodNum} / `)}${mirror('page.method_nav', p.method_nav)}</div>
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `perl -e 'alarm 200; exec @ARGV' -- npx vitest run lib/aeo-outbound/render.test.ts lib/aeo-outbound/render.frame.test.ts app/actions/aeo-outbound.test.ts lib/aeo-outbound/v1-compat.test.ts`
Expected: PASS, `v1-compat.test.ts` included with no change to it (the shown page is byte-identical).

- [ ] **Step 5: Commit and push**

```bash
git status --porcelain
git add lib/aeo-outbound/render.ts lib/aeo-outbound/render.test.ts lib/aeo-outbound/render.frame.test.ts app/actions/aeo-outbound.test.ts
git commit -m "Render without the Opportunities page when it is off; Methodology becomes 04 (Ryan, round 3)"
perl -e 'alarm 30; exec @ARGV' -- git push
```

---

### Task 3: The toolbar button (spec S3, r2-1 to r2-3, r2-6)

**Files:**
- Modify: `components/aeo-outbound/messages.ts` (after `DONE_EDITING`, line 58), `components/aeo-outbound/editor.tsx`, `app/tools/new-business/[reportId]/page.tsx:56`
- Test: `components/aeo-outbound/editor.test.tsx`

**Interfaces:**
- Consumes: `OPPS_HIDE`, `OPPS_SHOW` from Task 1; `FullSlots.opportunities_page`.
- Produces: `OutboundEditor` prop `opportunitiesHidden: boolean`; messages `OPPS_ON`, `OPPS_OFF`.

- [ ] **Step 1: Write the failing tests**

`components/aeo-outbound/editor.test.tsx`: in `base` (line 48) add `opportunitiesHidden: false,` after `needsValidation: [],`. Then append:

```ts
// Round 3 (Ryan, 2026-10-21): the Opportunities page switch in the toolbar.
const oppsBtn = () => screen.getByRole('button', { name: /^Opportunities page: (on|off)$/ })
const structurePaths = () => patches().map(([, init]) => JSON.parse(String(init?.body)) as { path: string }).map((b) => b.path).filter((p) => p.startsWith('opportunities_page.'))

test('the Opportunities page button shows the stored state, and is absent on a sent or unreadable report', async () => {
  await setup()
  expect(oppsBtn()).toHaveTextContent('Opportunities page: on')
  cleanup()
  await setup({ opportunitiesHidden: true })
  expect(oppsBtn()).toHaveTextContent('Opportunities page: off')
  cleanup()
  await setup({ status: 'live', token: 'AAAAAAAAAAAAAAAAAAAAAAAA' })
  expect(screen.queryByRole('button', { name: /^Opportunities page/ })).toBeNull()
  cleanup()
  render(<OutboundEditor {...base} unreadable />)
  expect(screen.queryByRole('button', { name: /^Opportunities page/ })).toBeNull()
})

test('it is disabled until the report has loaded', () => {
  render(<OutboundEditor {...base} />)
  expect(oppsBtn()).toBeDisabled()
})

test('a click makes the frame read-only, sends the opposite path as a structure, flips after the 200 and reloads the frame', async () => {
  const { iframe } = await setup()
  const post = vi.spyOn(iframe.contentWindow!, 'postMessage')
  patch = async () => json(200, { revision: 5, notes: [], needsValidation: [], slots: {} })
  fireEvent.click(oppsBtn())
  expect(post).toHaveBeenCalledWith({ type: 'mode', edit: false }, '*')
  await waitFor(() => expect(patches()).toHaveLength(1))
  expect(JSON.parse(String(patches()[0][1]?.body))).toEqual({ path: 'opportunities_page.hide', value: 'structure', revision: 4, writer: expect.stringMatching(UUID), seq: 1 })
  await waitFor(() => expect(oppsBtn()).toHaveTextContent('Opportunities page: off'))
  await waitFor(() => expect(views()).toHaveLength(2))
})

test('the button keeps its state after a 400 or a 409', async () => {
  patch = async () => json(400, { error: 'unknown field' })
  await setup()
  fireEvent.click(oppsBtn())
  await waitFor(() => expect(patches()).toHaveLength(1))
  expect(oppsBtn()).toHaveTextContent('Opportunities page: on')
  cleanup(); fetchMock.mockClear()
  patch = async () => json(409, { error: 'stale', revision: 9 })
  await setup()
  fireEvent.click(oppsBtn())
  expect(await screen.findByText('This snapshot changed. Reload.')).toBeInTheDocument()
  expect(oppsBtn()).toHaveTextContent('Opportunities page: on')
  expect(oppsBtn()).toBeDisabled()
})

test("disabled while an edit is unsaved, with Approve's title; a click that lands before that renders sends nothing (spec r2-1)", async () => {
  const { iframe } = await setup()
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'dirty', path: 'why' }, source: iframe.contentWindow }))
    oppsBtn().click()
  })
  expect(oppsBtn()).toBeDisabled()
  expect(oppsBtn().getAttribute('title')).toBe(approveBtn().getAttribute('title'))
  await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
  expect(structurePaths()).toEqual([])
})

test('two clicks before a re-render send one PATCH', async () => {
  patch = async () => json(200, { revision: 5, notes: [], needsValidation: [], slots: {} })
  await setup()
  act(() => { oppsBtn().click(); oppsBtn().click() })
  await waitFor(() => expect(structurePaths()).toHaveLength(1))
  await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
  expect(structurePaths()).toEqual(['opportunities_page.hide'])
})

test('the button re-seeds from newer props, never from props older than a save it made', async () => {
  patch = async () => json(200, { revision: 7, notes: [], needsValidation: [] })
  const { iframe, rerender } = await setup()
  await fromFrame(iframe, { type: 'edit', path: 'headline', value: 'H' })
  await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument())
  rerender(<OutboundEditor {...base} revision={5} opportunitiesHidden />)
  expect(oppsBtn()).toHaveTextContent('Opportunities page: on')
  rerender(<OutboundEditor {...base} revision={8} opportunitiesHidden />)
  expect(oppsBtn()).toHaveTextContent('Opportunities page: off')
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `perl -e 'alarm 200; exec @ARGV' -- npx vitest run components/aeo-outbound/editor.test.tsx`
Expected: FAIL: no button named "Opportunities page: on|off". (TypeScript may also flag the unknown prop until Step 3; vitest still runs.)

- [ ] **Step 3: Write the implementation**

`components/aeo-outbound/messages.ts`, after `DONE_EDITING` (line 58):

```ts
/** Round 3 (Ryan, 2026-10-21): the Opportunities page switch; the text carries the state. */
export const OPPS_ON = 'Opportunities page: on'
export const OPPS_OFF = 'Opportunities page: off'
```

`components/aeo-outbound/editor.tsx`:
- Import `OPPS_HIDE, OPPS_SHOW` from `@/lib/aeo-outbound/slots` (line 15, beside `isStructuralPath`) and `OPPS_ON, OPPS_OFF` from `./messages` (beside `EDIT`, `DONE_EDITING`).
- In `Props`, after `needsValidation: string[]` (line 50):

```ts
  /** Round 3: the draft's Opportunities page is off. */
  opportunitiesHidden: boolean
```

- After `const [titles, setTitles] = useState<[string, string]>(props.sectionTitles)` (line 122):

```ts
  const [oppsHidden, setOppsHidden] = useState(props.opportunitiesHidden)
```

- Line 131 becomes:

```ts
    if (!older) { setNotes(props.notes); setNeedsValidation(props.needsValidation); setBrand(props.brand); setTitles(props.sectionTitles); setOppsHidden(props.opportunitiesHidden) }
```

- In `send`, inside `if (isStructuralPath(path)) {` (line 221), first line of the block:

```ts
          if (path === OPPS_HIDE) setOppsHidden(true)
          else if (path === OPPS_SHOW) setOppsHidden(false)
```

- After `approveTitle` (line 342):

```ts
  // Round 3: the Opportunities page switch waits exactly when Approve waits for saving, and until the report has loaded,
  // so an edit always lands before it and a refused cell is fixed before its page can be hidden (spec S3, r2-3).
  const oppsDisabled = busySaving || busy || html === null
  function onToggleOpps() {
    const q = queueRef.current
    // The queue's live state, not the rendered one: a frame dirty message can land before React re-renders (spec r2-1).
    if (!q || q.state.dirty || q.state.saving || q.state.stopped || q.state.structuring) return
    toFrame({ type: 'mode', edit: false })
    q.structure(oppsHidden ? OPPS_SHOW : OPPS_HIDE)
  }
```

- Before the Approve button (line 495), a new block:

```tsx
            {status === 'draft' && !props.unreadable && (
              <button type="button" className={btnCls} disabled={oppsDisabled} title={approveTitle} onClick={onToggleOpps}>{oppsHidden ? OPPS_OFF : OPPS_ON}</button>
            )}
```

`app/tools/new-business/[reportId]/page.tsx`, after line 56 (`needsValidation=...`):

```tsx
      opportunitiesHidden={full?.opportunities_page === 'hidden'}
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `perl -e 'alarm 200; exec @ARGV' -- npx vitest run components/aeo-outbound/editor.test.tsx components/aeo-outbound/editor-page.test.tsx`
Expected: PASS, existing editor tests included.

- [ ] **Step 5: Commit and push**

```bash
git status --porcelain
git add components/aeo-outbound/messages.ts components/aeo-outbound/editor.tsx components/aeo-outbound/editor.test.tsx 'app/tools/new-business/[reportId]/page.tsx'
git commit -m "Editor: Opportunities page on/off button before Approve (Ryan, round 3)"
perl -e 'alarm 30; exec @ARGV' -- git push
```

---

### Task 4: Full checks, browser check, draft PR

- [ ] **Step 1: The CI commands, locally** (`Makefile:17-21`, build left to CI)

```bash
perl -e 'alarm 300; exec @ARGV' -- npm run typecheck
perl -e 'alarm 590; exec @ARGV' -- npm test
perl -e 'alarm 300; exec @ARGV' -- npm run check:rsc
perl -e 'alarm 120; exec @ARGV' -- npx eslint lib/aeo-outbound/slots.ts lib/aeo-outbound/contracts.ts lib/aeo-outbound/render.ts components/aeo-outbound/editor.tsx components/aeo-outbound/messages.ts 'app/tools/new-business/[reportId]/page.tsx'
```

Expected: each passes. Keep the raw final lines for the PR.

- [ ] **Step 2: Browser check** of this branch's real render (a local static page, as for the charts PR), hidden and shown, at 1440 and 375px: no Opportunities section or menu item when hidden, Methodology 04 in menu and label, the menu's bottom highlight lands on Methodology, "Why it matters" present. The editor button is covered by the editor tests; the live click-through happens on staging after promotion.

- [ ] **Step 3: Open the PR as a draft against `dev` with no reviewer** ("AEO Outbound: turn the Opportunities page on or off → dev"). The body says what changed and why, links the spec, review log and plan, and pastes the Step 1 output. Do not request Paul: the round-3 PRs go to him together on Thomas's word.
