# Organic Social Without Overview Implementation Plan

> **For the executor:** run inline in this session with superpowers:executing-plans. No subagents. Steps use checkbox (`- [ ]`) syntax. Stop at the step marked **STOP**.

**Goal:** A client whose hidden reports list `organic-overview` gets no Organic Social Overview and opens on its first platform tab; every other client, Renaissance included, is unchanged.

**Update 2026-09-21.** The Kenect record's name and channel list, which Task 2, Step 3 says wait on Jasmine's question 1,
are settled: "Akara Living, Kenect Nashville", `["instagram"]`, set on staging with my go.

**Architecture:** One named id and a small change to `organicSocialSubsections`. The shared `visibleSubsections`, the resolver, the sidebars and the pages are untouched.

**Tech Stack:** TypeScript strict, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-09-18-organic-no-overview-design.md`

## Global Constraints

- Renaissance does not change. The drift check reads identical in every surface line, row and users, in prod, staging and dev.
- `visibleSubsections` is not edited.
- No database write in the code change. Writing the three clients' `hidden_reports` on staging is a separate step that waits for approval.
- No em or en dash characters in anything added.
- Before every commit: `npx vitest run`, `npx tsc --noEmit`, `npm run check:rsc` clean. Baseline on this branch (cut from `origin/dev`): **1054** tests passing.
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Branch `feat/organic-social-no-overview`, off `dev`, its own draft PR into `dev`.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `lib/constants.ts` | Modify | `ORGANIC_OVERVIEW_TAB_ID`, and `organicSocialSubsections` honouring it |
| `lib/organic-social/no-overview.test.ts` | Create | Outline tabs without Overview, the landing tab, Renaissance unchanged |

---

### Task 1: Let a client hide Organic Social's Overview

**Files:**
- Modify: `lib/constants.ts` (`organicSocialSubsections` and its doc comment)
- Create: `lib/organic-social/no-overview.test.ts`

**Interfaces:**
- Consumes: `ORGANIC_SOCIAL_SUBSECTIONS`, `visibleSubsections`, `resolveOrganicSubsection`, `AEO_SUBSECTIONS` (`lib/constants.ts`); `resolveChannels` (`metrics.ts`).
- Produces: `export const ORGANIC_OVERVIEW_TAB_ID = 'organic-overview'`.

- [ ] **Step 1: Write the failing tests**

Create `lib/organic-social/no-overview.test.ts`:

```ts
import { expect, test } from 'vitest'
import {
  AEO_SUBSECTIONS, ORGANIC_OVERVIEW_TAB_ID, organicSocialSubsections, resolveOrganicSubsection, visibleSubsections,
} from '@/lib/constants'
import type { Client } from '@/lib/db/schema'

// The three new clients' outlines all begin "[remove] Overview". A client hides Organic
// Social's Overview by listing ORGANIC_OVERVIEW_TAB_ID in its hidden reports.
const client = (channels: string[] | undefined, hidden: string[]): Client =>
  ({ dashSocialConfig: { brandId: 1, channels }, hiddenReports: hidden } as unknown as Client)
const tabs = (c: Client) => organicSocialSubsections(c).map((s) => s.id)
const APFM = client(['instagram', 'facebook', 'linkedin'], ['organic-overview'])

test('the id is organic-overview, namespaced like the platform tabs', () => {
  expect(ORGANIC_OVERVIEW_TAB_ID).toBe('organic-overview')
})

test('a client that hides Overview gets only its platform tabs, in outline order', () => {
  expect(tabs(APFM)).toEqual(['organic-instagram', 'organic-facebook', 'organic-linkedin'])
})

test('with Overview hidden, the report opens on the first platform tab', () => {
  expect(resolveOrganicSubsection(APFM, null).id).toBe('organic-instagram')
  expect(resolveOrganicSubsection(APFM, undefined).channel).toBe('INSTAGRAM')
  expect(resolveOrganicSubsection(APFM, 'nope').id).toBe('organic-instagram')
})

test('with Overview hidden, a named platform tab still opens', () => {
  expect(resolveOrganicSubsection(APFM, 'organic-linkedin').channel).toBe('LINKEDIN')
})

// THE RENAISSANCE GUARD. Its hidden reports (read 2026-09-18) do not list organic-overview
// and it has no channel allowlist, so its Organic Social tabs are exactly today's.
test("Renaissance's settings keep Overview first and every tab as today", () => {
  const ren = client(undefined, ['technical-audit', 'content-impact'])
  expect(tabs(ren)).toEqual([null, 'organic-instagram', 'organic-facebook', 'organic-linkedin', 'organic-x'])
  expect(resolveOrganicSubsection(ren, null).channel).toBeNull()
})

test('hiding Overview never leaves a client with no tabs', () => {
  expect(tabs(client(['youtube'], ['organic-overview']))).toEqual([null])
  expect(tabs(client(['instagram'], ['organic-overview', 'organic-instagram']))).toEqual([null])
})

// organic-overview belongs to Organic Social alone: the shared helper other sections use
// still keeps their Overview.
test("hiding Organic Social's Overview does not hide another section's Overview", () => {
  expect(visibleSubsections(AEO_SUBSECTIONS, ['organic-overview'])[0].id).toBeNull()
})
```

- [ ] **Step 2: Run to verify the right ones fail**

Run: `npx vitest run lib/organic-social/no-overview.test.ts`
Expected: FAIL, 3 tests: the id test (`undefined`), `a client that hides Overview...` (Overview still first), and `with Overview hidden, the report opens...` (lands on Overview). Four pass already because they pin behaviour that must hold before and after: a named tab opens, Renaissance's tabs, never zero tabs, and another section's Overview.

- [ ] **Step 3: Implement**

In `lib/constants.ts`, replace:

```ts
/** Overview + the platform tabs this client is configured for AND has not hidden. */
export function organicSocialSubsections(client: Client) {
  const allowed = resolveChannels(client.dashSocialConfig?.channels)
  return visibleSubsections(ORGANIC_SOCIAL_SUBSECTIONS, client.hiddenReports)
    .filter((s) => s.channel == null || allowed.includes(s.channel))
}
```

with:

```ts
/** A client hides Organic Social's Overview by listing this id in `hidden_reports`. The three
 *  new Organic Social clients' outlines remove Overview; Renaissance does not list it and keeps
 *  Overview. Namespaced like the platform tab ids, since `hidden_reports` is one flat list. */
export const ORGANIC_OVERVIEW_TAB_ID = 'organic-overview'

/** Overview + the platform tabs this client is configured for AND has not hidden. A client can
 *  hide Overview (ORGANIC_OVERVIEW_TAB_ID); its report then opens on its first platform tab.
 *  Overview is kept anyway when no platform tab is left, so a client never ends up with no tabs.
 *  `visibleSubsections` is shared with the other sections and still keeps their Overview. */
export function organicSocialSubsections(client: Client) {
  const allowed = resolveChannels(client.dashSocialConfig?.channels)
  const subs = visibleSubsections(ORGANIC_SOCIAL_SUBSECTIONS, client.hiddenReports)
    .filter((s) => s.channel == null || allowed.includes(s.channel))
  const hidden = new Set<string>(client.hiddenReports ?? [])
  if (!hidden.has(ORGANIC_OVERVIEW_TAB_ID) || !subs.some((s) => s.channel != null)) return subs
  return subs.filter((s) => s.id != null)
}
```

- [ ] **Step 4: Run to verify they pass, then the gates**

Run: `npx vitest run lib/organic-social/no-overview.test.ts lib/organic-social/subsections.test.ts`
Expected: PASS.

Run: `npx vitest run && npx tsc --noEmit && npm run check:rsc`
Expected: **1061** passed (1054 + 7), `tsc` silent, RSC check passed.

- [ ] **Step 5: Commit**

```bash
git add lib/constants.ts lib/organic-social/no-overview.test.ts
git commit -m "feat(organic-social): let a client's Organic Social open without Overview

All three new clients' outlines remove Overview, and Overview could not be
removed: the tab helper always kept it and the resolver always fell back to
it. A client now hides it by listing organic-overview in hidden_reports, the
existing per-client setting for hiding tabs, and its report opens on its
first platform tab. Overview stays if no platform tab is left. The shared
visibleSubsections, used by every section, is unchanged, and Renaissance does
not list the id, so its tabs are exactly today's.

Edge cases in the code this touches:
- input boundaries: fix. No tab, an unknown tab or a hidden tab resolves to a
  real tab; a client can never be left with zero tabs.
- external failure, operator visibility, bounds, state and concurrency,
  security: decline. A pure function of the client record; nothing fetched
  or stored.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Prove Renaissance is untouched, push, open the PR

- [ ] **Step 1: Drift check**

```bash
~/.claude/renaissance-baseline/check-drift.sh > /tmp/drift-no-overview.txt 2>&1; grep -E '^\s+[<>] ' /tmp/drift-no-overview.txt; grep -E 'RESULT|OK, (identical|row)' /tmp/drift-no-overview.txt
```
Expected: no differing line at all; the surface and database sections `OK` in all three environments; the result line reports no drift. The file section lists `lib/constants.ts` as changed, which is advisory on a feature branch.

- [ ] **Step 2: Push and open a draft PR into `dev`**

```bash
git push -u origin feat/organic-social-no-overview
```

Open a draft PR titled `feat(organic-social): let a client's Organic Social open without Overview → dev`, describing the mechanism, the tests, the drift proof, and that turning it on for the three clients is a separate staging write.

- [ ] **Step 3: STOP. Turning it on for the three clients is a database write.**

On staging only, and only with explicit approval: append `organic-overview` to `hidden_reports` for `a-place-for-mom`, `joy-of-life` and the Kenect record. The Kenect record's name and channel list wait on Jasmine's question 1.

---

## Self-Review

- **Spec coverage:** the id and the rule (Task 1 Step 3); every listed test (Step 1); the drift proof, the PR, and the staging write kept separate (Task 2).
- **Placeholders:** none.
- **Types:** `ORGANIC_OVERVIEW_TAB_ID` is a string; `hiddenReports` is read into a `Set<string>`, so its `ReportSlug[]` type needs no change.
