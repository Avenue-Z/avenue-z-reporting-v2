# TikTok Tab Implementation Plan

> **For the executor:** run inline in this session with superpowers:executing-plans. No subagents. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Joy of Life gets a TikTok tab, in the outline's order, and no client without TikTok in its allowlist can see or reach one.

**Architecture:** Append one entry to `ORGANIC_SOCIAL_SUBSECTIONS`. The existing allowlist and hidden-tab filtering do the rest.

**Tech Stack:** TypeScript strict, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-09-18-tiktok-tab-design.md`

## Global Constraints

- Renaissance does not change. Every `REN.*` drift line identical in prod, staging and dev, including `REN.RESOLVED_TABS`.
- No database write.
- No em or en dash characters in anything added.
- Before every commit: `npx vitest run`, `npx tsc --noEmit`, `npm run check:rsc` clean. Baseline: **1069** tests passing.
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Branch `feat/organic-social-tiktok-channel` (PR 247).

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `lib/constants.ts` | Modify | The `organic-tiktok` tab entry |
| `lib/organic-social/subsections.test.ts` | Modify | The order test ends with `organic-tiktok` |
| `lib/organic-social/tiktok-tab.test.ts` | Create | Per-client tabs from the outlines, Renaissance never offered TikTok |

---

### Task 1: Add the TikTok tab

**Files:**
- Modify: `lib/constants.ts` (the `ORGANIC_SOCIAL_SUBSECTIONS` array)
- Modify: `lib/organic-social/subsections.test.ts:8-12`
- Create: `lib/organic-social/tiktok-tab.test.ts`

**Interfaces:**
- Consumes: `ORGANIC_SOCIAL_SUBSECTIONS`, `organicSocialSubsections(client)`, `resolveOrganicSubsection(client, subsection)` (`lib/constants.ts`); `orgSocialChannelViewKey`, `isCommentaryViewKey` (`lib/commentary/views.ts`).
- Produces: the tab `{ id: 'organic-tiktok', label: 'TikTok', channel: 'TIKTOK' }`.

- [ ] **Step 1: Change the order test**

In `lib/organic-social/subsections.test.ts`, replace:

```ts
test('order is Overview, Instagram, Facebook, LinkedIn, X', () => {
  expect(ORGANIC_SOCIAL_SUBSECTIONS.map((s) => s.id)).toEqual(
    [null, 'organic-instagram', 'organic-facebook', 'organic-linkedin', 'organic-x'],
  )
})
```

with:

```ts
test('order is Overview, Instagram, Facebook, LinkedIn, X, TikTok', () => {
  expect(ORGANIC_SOCIAL_SUBSECTIONS.map((s) => s.id)).toEqual(
    [null, 'organic-instagram', 'organic-facebook', 'organic-linkedin', 'organic-x', 'organic-tiktok'],
  )
})
```

- [ ] **Step 2: Write the new tests**

Create `lib/organic-social/tiktok-tab.test.ts`:

```ts
import { expect, test } from 'vitest'
import { organicSocialSubsections, resolveOrganicSubsection } from '@/lib/constants'
import { isCommentaryViewKey, orgSocialChannelViewKey } from '@/lib/commentary/views'
import type { Client } from '@/lib/db/schema'

// Each client's tabs follow its outline. Overview is still listed until its removal is built.
const client = (channels?: string[], hidden: string[] = []): Client =>
  ({ dashSocialConfig: { brandId: 1, channels }, hiddenReports: hidden } as unknown as Client)
const tabs = (c: Client) => organicSocialSubsections(c).map((s) => s.id)

test("Joy of Life's outline: Instagram, Facebook, TikTok, in that order", () => {
  expect(tabs(client(['instagram', 'facebook', 'tiktok'])))
    .toEqual([null, 'organic-instagram', 'organic-facebook', 'organic-tiktok'])
})

test('the TikTok tab shows the TikTok channel under the label TikTok', () => {
  const tab = resolveOrganicSubsection(client(['instagram', 'facebook', 'tiktok']), 'organic-tiktok')
  expect(tab).toEqual({ id: 'organic-tiktok', label: 'TikTok', channel: 'TIKTOK' })
})

test("A Place For Mom's and Kenect's outlines get exactly their tabs, no TikTok", () => {
  expect(tabs(client(['instagram', 'facebook', 'linkedin'])))
    .toEqual([null, 'organic-instagram', 'organic-facebook', 'organic-linkedin'])
  expect(tabs(client(['instagram']))).toEqual([null, 'organic-instagram'])
})

// THE RENAISSANCE GUARD FOR THE TAB. No allowlist resolves to the four original channels, so
// the TikTok tab is never offered, and a hand-typed URL for it falls back to Overview.
test('a client with no allowlist is never offered the TikTok tab, even by URL', () => {
  expect(tabs(client())).not.toContain('organic-tiktok')
  expect(resolveOrganicSubsection(client(), 'organic-tiktok').channel).toBeNull()
})

test('the TikTok tab can be hidden per client, like any other tab', () => {
  expect(tabs(client(['instagram', 'facebook', 'tiktok']))).toContain('organic-tiktok')
  expect(tabs(client(['instagram', 'facebook', 'tiktok'], ['organic-tiktok']))).not.toContain('organic-tiktok')
})

// The outlines put Commentary on every tab.
test('the TikTok tab has a Commentary view', () => {
  expect(isCommentaryViewKey(orgSocialChannelViewKey('TIKTOK'))).toBe(true)
})
```

- [ ] **Step 3: Run them to verify the right ones fail**

Run: `npx vitest run lib/organic-social/subsections.test.ts lib/organic-social/tiktok-tab.test.ts`
Expected: FAIL, 4 tests: the order test (no `organic-tiktok`), Joy of Life's tabs (no TikTok tab), `the TikTok tab shows the TikTok channel...` (falls back to Overview), and `the TikTok tab can be hidden...` (its first assertion). Three pass already because they pin behaviour that must hold before and after: A Place For Mom's and Kenect's tabs, Renaissance never offered TikTok, and the Commentary view.

- [ ] **Step 4: Implement**

In `lib/constants.ts`, replace:

```ts
  { id: 'organic-x',           label: 'X',         channel: 'TWITTER' },
]
```

with:

```ts
  { id: 'organic-x',           label: 'X',         channel: 'TWITTER' },
  // Last, so every existing tab keeps its place. Offered only to a client whose allowlist names
  // TikTok: a client with no allowlist resolves to the four original channels (DEFAULT_CHANNELS).
  { id: 'organic-tiktok',      label: 'TikTok',    channel: 'TIKTOK' },
]
```

- [ ] **Step 5: Run to verify they pass, then the gates**

Run: `npx vitest run lib/organic-social/subsections.test.ts lib/organic-social/tiktok-tab.test.ts`
Expected: PASS.

Run: `npx vitest run && npx tsc --noEmit && npm run check:rsc`
Expected: **1075** passed (1069 + 6), `tsc` silent, RSC check passed.

- [ ] **Step 6: Commit**

```bash
git add lib/constants.ts lib/organic-social/subsections.test.ts lib/organic-social/tiktok-tab.test.ts
git commit -m "feat(organic-social): a TikTok tab for clients whose allowlist names TikTok

Joy of Life's outline has Instagram, Facebook and TikTok tabs; there was no
TikTok tab, so its TikTok content showed only on Overview, which the outlines
remove. The tab is appended last, so every existing tab keeps its place, and
it is offered only to a client whose allowlist names TikTok. Renaissance, with
no allowlist, is never offered it, and a hand-typed URL for it falls back to
Overview.

Edge cases in the code this touches:
- input boundaries: fix. The subsection URL parameter can now name
  organic-tiktok; for a client without TikTok it falls back to Overview.
- external failure, operator visibility, bounds, state and concurrency,
  security: decline. Nothing new is fetched or stored; the tab reuses the
  parts and error handling of every other platform tab.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Prove Renaissance is untouched, push, update the PR

- [ ] **Step 1: Drift check**

```bash
~/.claude/renaissance-baseline/check-drift.sh > /tmp/drift-247-tab.txt 2>&1; grep -E '^\s+[<>] REN\.' /tmp/drift-247-tab.txt
```
Expected: no output. Then `grep -E '^\s+[<>] ' /tmp/drift-247-tab.txt | grep -vE 'CHANNELS=|LABEL\.TIKTOK|KPI\.TIKTOK\.|SUBSECTIONS='` returns nothing: the only differences describe the code. The database section reads `OK, row + users identical` for all three.

- [ ] **Step 2: Push and update PR 247's description** (the "Next on this PR" section becomes done).

---

## Self-Review

- **Spec coverage:** the entry and its position (Task 1 Step 4); every listed test (Steps 1, 2); the Renaissance proof and no database write (Task 2).
- **Placeholders:** none.
- **Types:** the entry matches the array's `{ id: string | null; label: string; channel: DashChannel | null }` shape; `'TIKTOK'` is a `DashChannel` on this branch.
