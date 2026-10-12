# TikTok Default Channels Implementation Plan

> **For the executor:** run inline in this session with superpowers:executing-plans. No subagents. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A client with no channel allowlist resolves to the four original channels, so TikTok (added to `CHANNELS` by PR 247) reaches only clients that name it, and Renaissance's live report does not gain a TikTok section.

**Architecture:** One closed constant, `DEFAULT_CHANNELS`, and a one-line change in `resolveChannels`. Every caller keeps calling `resolveChannels` unchanged. No database write.

**Tech Stack:** TypeScript strict, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-09-18-tiktok-default-channels-design.md`

## Global Constraints

- Renaissance does not change: not its config row, not what it renders. Proven by the drift check: every `REN.*` line identical to the baseline in prod, staging and dev.
- No database write. The drift check and the tests only read.
- No em or en dash characters in anything added.
- Before every commit: `npx vitest run`, `npx tsc --noEmit`, `npm run check:rsc` all clean. Baseline on this branch: **1063** tests passing.
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Branch `feat/organic-social-tiktok-channel` (PR 247).

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `lib/organic-social/metrics.ts` | Modify | `DEFAULT_CHANNELS`, and `resolveChannels` returning it for an absent allowlist |
| `lib/organic-social/scope.test.ts` | Modify | The absent-allowlist test now expects the four |
| `lib/organic-social/default-channels.test.ts` | Create | The default is closed; named TikTok resolves; the real lookup and tabs |
| `lib/db/schema.ts` | Modify, comment only | `DashSocialConfig.channels` describes the new default |

---

### Task 1: Pin the no-allowlist default to the original four

**Files:**
- Modify: `lib/organic-social/metrics.ts:32-39`
- Modify: `lib/organic-social/scope.test.ts:8-13`
- Create: `lib/organic-social/default-channels.test.ts`
- Modify: `lib/db/schema.ts` (the `channels` doc comment in `DashSocialConfig`)

**Interfaces:**
- Consumes: `CHANNELS`, `DashChannel`, `resolveChannels` (`metrics.ts`); `dashClientFor` (`base.ts`); `organicSocialSubsections` (`lib/constants.ts`).
- Produces: `export const DEFAULT_CHANNELS: readonly ['INSTAGRAM', 'FACEBOOK', 'TWITTER', 'LINKEDIN']`.

- [ ] **Step 1: Change the existing test to the new rule**

In `lib/organic-social/scope.test.ts`, replace:

```ts
test('absent allowlist ⇒ every supported channel', () => {
  const all = ['INSTAGRAM', 'FACEBOOK', 'TWITTER', 'LINKEDIN', 'TIKTOK']
  expect(resolveChannels()).toEqual(all)
  expect(resolveChannels(null)).toEqual(all)
  expect(resolveChannels([])).toEqual(all)
})
```

with:

```ts
test('absent allowlist ⇒ the four default channels, never a newer one', () => {
  const four = ['INSTAGRAM', 'FACEBOOK', 'TWITTER', 'LINKEDIN']
  expect(resolveChannels()).toEqual(four)
  expect(resolveChannels(null)).toEqual(four)
  expect(resolveChannels([])).toEqual(four)
})
```

- [ ] **Step 2: Write the new tests**

Create `lib/organic-social/default-channels.test.ts`:

```ts
import { expect, test, vi } from 'vitest'

// The client lookup is the only database touch on this path; each test hands it a config.
const { getClientBySlug } = vi.hoisted(() => ({ getClientBySlug: vi.fn() }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug }))

import { CHANNELS, DEFAULT_CHANNELS, resolveChannels } from './metrics'
import { dashClientFor } from './base'
import { organicSocialSubsections } from '@/lib/constants'
import type { Client } from '@/lib/db/schema'

const FOUR = ['INSTAGRAM', 'FACEBOOK', 'TWITTER', 'LINKEDIN']

// THE RENAISSANCE GUARD FOR CHANNELS. Renaissance is the only client with no channel
// allowlist (prod, staging and dev, read 2026-09-18). Whatever is added to CHANNELS, a
// client with no allowlist keeps exactly these four. Putting a channel into the default
// changes Renaissance's live report, so it has to be a deliberate edit to this test.
test('the default is exactly the four original channels, in order', () => {
  expect([...DEFAULT_CHANNELS]).toEqual(FOUR)
})

test('every default is a supported channel, and TikTok is not a default', () => {
  for (const c of DEFAULT_CHANNELS) expect(CHANNELS).toContain(c)
  expect(DEFAULT_CHANNELS).not.toContain('TIKTOK')
})

test("a client that names TikTok gets it, in CHANNELS order (Joy of Life's allowlist)", () => {
  expect(resolveChannels(['instagram', 'facebook', 'tiktok'])).toEqual(['INSTAGRAM', 'FACEBOOK', 'TIKTOK'])
})

test('a client with no allowlist gets the four through the real client lookup', async () => {
  process.env.DASH_API_TOKEN ??= 'test-token'
  getClientBySlug.mockResolvedValueOnce({ dashSocialConfig: { brandId: 1 } })
  expect((await dashClientFor('no-allowlist-client')).channels).toEqual(FOUR)
})

test('a client that names TikTok gets it through the real client lookup', async () => {
  process.env.DASH_API_TOKEN ??= 'test-token'
  getClientBySlug.mockResolvedValueOnce({ dashSocialConfig: { brandId: 2, channels: ['instagram', 'facebook', 'tiktok'] } })
  expect((await dashClientFor('names-tiktok-client')).channels).toEqual(['INSTAGRAM', 'FACEBOOK', 'TIKTOK'])
})

// Also guards the TikTok tab that comes next: it must never appear for a client
// with no allowlist.
test('a client with no allowlist keeps exactly the tabs it has today', () => {
  const client = { dashSocialConfig: { brandId: 1 }, hiddenReports: [] } as unknown as Client
  expect(organicSocialSubsections(client).map((s) => s.id))
    .toEqual([null, 'organic-instagram', 'organic-facebook', 'organic-linkedin', 'organic-x'])
})
```

- [ ] **Step 3: Run them to verify the right ones fail**

Run: `npx vitest run lib/organic-social/scope.test.ts lib/organic-social/default-channels.test.ts`
Expected: FAIL, 4 tests. The changed scope test fails on the extra `'TIKTOK'`. `the default is exactly the four...` and `every default is a supported channel...` fail because `DEFAULT_CHANNELS` does not exist yet (`not iterable`). `a client with no allowlist gets the four through the real client lookup` fails on the extra `'TIKTOK'`. Three new tests pass already, because they pin behaviour that must hold before and after: a named TikTok resolves (twice) and the tabs are today's.

- [ ] **Step 4: Implement**

In `lib/organic-social/metrics.ts`, replace:

```ts
/** Resolve the reportable Dash channels, honoring an optional lowercase allowlist.
 *  Absent/empty ⇒ all four. Order always follows CHANNELS.
```

with:

```ts
/** The channels a client with NO allowlist resolves to: the four it has always had. Closed on
 *  purpose. Adding a channel to CHANNELS (TikTok, PR 247) must not add it here, or every client
 *  without an allowlist gains it with nobody deciding. Renaissance is that client, live in
 *  production, so a newer channel is opt-in: a client gets it only by naming it. */
export const DEFAULT_CHANNELS = ['INSTAGRAM', 'FACEBOOK', 'TWITTER', 'LINKEDIN'] as const satisfies readonly DashChannel[]

/** Resolve the reportable Dash channels, honoring an optional lowercase allowlist.
 *  Absent/empty ⇒ DEFAULT_CHANNELS, never a newer channel. A named allowlist filters CHANNELS,
 *  so it can name TikTok. Order always follows CHANNELS.
```

and replace:

```ts
  if (!allowlist?.length) return [...CHANNELS]
```

with:

```ts
  if (!allowlist?.length) return [...DEFAULT_CHANNELS]
```

In `lib/db/schema.ts`, replace:

```ts
  /** Optional channel allowlist (lowercase 'instagram','facebook','twitter'); defaults to all reportable channels.
```

with:

```ts
  /** Optional channel allowlist (lowercase 'instagram','facebook','twitter','linkedin','tiktok'). Absent resolves to
   *  DEFAULT_CHANNELS, the original four; a newer channel such as TikTok appears only when named here.
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run lib/organic-social/scope.test.ts lib/organic-social/default-channels.test.ts`
Expected: PASS, every test in both files.

- [ ] **Step 6: Gates and commit**

Run: `npx vitest run && npx tsc --noEmit && npm run check:rsc`
Expected: **1069** passed (1063 + 6 new), `tsc` silent, RSC check passed.

```bash
git add lib/organic-social/metrics.ts lib/organic-social/scope.test.ts lib/organic-social/default-channels.test.ts lib/db/schema.ts
git commit -m "fix(organic-social): a client with no channel list keeps its original four

An absent allowlist resolved to every entry in CHANNELS, so adding TikTok gave
it to every client without an allowlist. Renaissance is the only such client,
in prod, staging and dev, and its live Overview would have gained an empty
TikTok section. The no-allowlist default is now a closed list of the original
four; a newer channel reaches a client only when its allowlist names it. No
database write, and Renaissance's row is untouched.

Edge cases in the code this touches:
- external failure: decline. Unchanged; a channel with no account answers
  200 with no data, which is why this fix exists.
- operator visibility: decline. Nothing new can fail.
- bounds: fix. The default is a fixed four however long CHANNELS grows.
- input boundaries: decline. Allowlist parsing is unchanged; validating an
  allowlist when it is written is an existing, tracked follow-up.
- state and concurrency: decline. A pure function of its argument.
- security: decline. No trust boundary moves.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Prove Renaissance is untouched, push, update the PR

- [ ] **Step 1: Drift check**

```bash
~/.claude/renaissance-baseline/check-drift.sh > /tmp/drift-247.txt 2>&1; grep -E '^\s+[<>] REN\.' /tmp/drift-247.txt
```
Expected: no output. No `REN.*` line differs from the baseline in any environment. The surface section still lists differences, but only in the lines that describe the code (`CHANNELS`, `LABEL.TIKTOK`, `KPI.TIKTOK.*`), which were on this branch before the fix; confirm with `grep -E '^\s+[<>] ' /tmp/drift-247.txt | grep -vE 'CHANNELS=|LABEL\.TIKTOK|KPI\.TIKTOK\.'` returning nothing. The database section must read `OK, row + users identical` for all three.

- [ ] **Step 2: Push and update the PR description**

```bash
git push origin feat/organic-social-tiktok-channel
```

In PR 247's description, the blocker section becomes resolved (what changed, the drift result), and the verification line gives the new test count. The TikTok tab stays listed as the next change.

---

## Self-Review

- **Spec coverage:** the constant and the one-line change (Task 1 Step 4); the two doc comments (Step 4); every listed test (Steps 1 and 2); the drift proof and no database write (Task 2). The TikTok tab is out of scope here by agreement.
- **Placeholders:** none.
- **Types:** `DEFAULT_CHANNELS` is a readonly tuple of `DashChannel`, spread into `DashChannel[]` by `resolveChannels`; the tests read it as an array.
