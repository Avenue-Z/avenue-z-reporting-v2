# Remove unused API routes and dead demo code: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete two API routes nothing calls, the widget and helper that only they use, and every doc line that
points at them, with a test that lists every API route so adding one is deliberate.

**Architecture:** Pure deletion plus one source-reading test. The test walks `app/`, keeps files named `route.*`, and
compares their folders to a hand-written list. Docs are edited only where the deletion leaves them pointing at
nothing.

**Tech Stack:** Next.js 16 App Router, TypeScript, vitest (explicit `include` list in `vitest.config.ts`).

**Spec:** `docs/superpowers/specs/2026-10-12-remove-unused-api-routes-design.md` (approved by Paul 2026-10-12, PR #373,
spec commit `4aea400b`). Branch `chore/remove-unused-api-routes`, cut from `origin/dev` `fd1da06b`.

## Global Constraints

- Delete exactly: `app/api/pr-placements/route.ts`, `app/api/glean/meeting-brief/route.ts`,
  `components/meeting-prep/index.tsx`, `lib/demo-auth.ts`.
- `lib/glean.ts`: remove `getLast7DaysRange` (`:20-28`) and `buildMeetingPrepPrompt` (`:102-132`); keep
  `GLEAN_BASE_URL`, `getGleanHeaders` (`lib/dashboard/nl/glean-chat.ts:1`) and `gleanChat` (`lib/peec/synopsis.ts:2`,
  `lib/peec/pr-influence-synopsis.ts:2`, `lib/peec/content-impact-synopsis.ts:3`).
- Leave: dated plans, specs and feedback logs; the `meeting-prep` filter strings
  (`components/layout/portal-sidebar.tsx:66`, `app/dashboard/settings/page.tsx:173`); the `pr-placements` report and
  `lib/newsapi.ts` (still imported by `components/report-sections/pr-placements/index.tsx:4`); the settings copy
  "Meeting Prep briefs" (`app/dashboard/settings/page.tsx:37-38`); env vars `NEWSAPI_AI_KEY` and `GLEAN_*`.
- The 10 routes that remain: `auth/[...nextauth]`, `auth/supermetrics-callback`, `cache-warm`,
  `discovery/sm-dimension-values`, `export/pdf`, `health/sweep`, `lock-sweep`, `perf/boundary`, `shopify/callback`,
  `shopify/install` (all under `app/api/`).
- Public repo wording: "remove unused API routes and dead demo code"; findings are "dead code, no callers"; the test is
  "every API route is listed here, so adding one is deliberate".
- No em or en dashes in anything this plan adds.

## Review Focus

1. A route file added outside `app/api/` (say `app/foo/route.ts`) must still fail the test: the walk covers all of
   `app/` and names the folder relative to `app/`. Pinned in Task 1.
2. A colocated test such as `app/api/export/pdf/route.test.ts` must not count as a route: the file-name rule is
   `^route\.(ts|tsx|js|jsx|mjs)$`. Pinned in Task 1 (that file exists today, so the real walk exercises it).
3. A stale `.next/dev/types/**` validator still imports both deleted routes (`tsconfig.json` includes it), so a local
   typecheck can fail on files that no longer exist. Task 4 deletes `.next` before `make check`.
4. A doc line left pointing at a deleted file: Task 3 ends with a `git grep` that must return only the allowed lines.
5. The Glean callers that stay (dashboard proposer, Peec synopses) must still compile and pass: covered by the full
   typecheck and suite in Task 4.

---

### Task 1: The API route inventory test (RED)

**Files:**
- Create: `lib/auth/api-routes.test.ts`
- Modify: `vitest.config.ts:58` (add the file after `'lib/auth/protected-pages.test.ts',`)

**Interfaces:**
- Consumes: nothing.
- Produces: the test file; Task 2 turns it green.

- [ ] **Step 1: Write the test**

```ts
// @vitest-environment node
// Every API route in the app, listed by hand. Adding a route means adding it here on purpose, and removing one means
// taking it off. This reads the source tree, so a route is covered the day it lands, wherever it is under app/.
import { readdirSync } from 'node:fs'
import { join, posix, sep } from 'node:path'
import { expect, test } from 'vitest'

const ROOT = process.cwd()
const ROUTE_FILE = /^route\.(ts|tsx|js|jsx|mjs)$/

/** Every route handler under app/, named by its folder relative to app/ (for example 'api/cache-warm'). A colocated
 *  test such as route.test.ts is not a route. */
function routesUnderApp(): string[] {
  return readdirSync(join(ROOT, 'app'), { recursive: true, encoding: 'utf8' })
    .map((f) => f.split(sep).join('/'))
    .filter((f) => ROUTE_FILE.test(posix.basename(f)))
    .map((f) => posix.dirname(f))
    .sort()
}

const ROUTES = [
  'api/auth/[...nextauth]',
  'api/auth/supermetrics-callback',
  'api/cache-warm',
  'api/discovery/sm-dimension-values',
  'api/export/pdf',
  'api/health/sweep',
  'api/lock-sweep',
  'api/perf/boundary',
  'api/shopify/callback',
  'api/shopify/install',
]

test('every API route is listed here, so adding one is deliberate', () => {
  expect(routesUnderApp()).toEqual([...ROUTES].sort())
})
```

- [ ] **Step 2: Add it to the vitest include list**

In `vitest.config.ts`, after the line `      'lib/auth/protected-pages.test.ts',` add:

```ts
      'lib/auth/api-routes.test.ts',
```

- [ ] **Step 3: Run it and watch it fail for the right reason**

Run: `npx vitest run lib/auth/api-routes.test.ts`
Expected: the run lists `lib/auth/api-routes.test.ts` and FAILS; the diff shows exactly two extra received entries,
`api/glean/meeting-brief` and `api/pr-placements`, and nothing missing. (Any other difference means the walk or the
list is wrong: fix the test, not the list.)

No commit: the test is committed with Task 2, green.

### Task 2: Delete the routes, the widget, the demo helper and the two Glean helpers (GREEN)

**Files:**
- Delete: `app/api/pr-placements/route.ts`, `app/api/glean/meeting-brief/route.ts`, `components/meeting-prep/index.tsx`,
  `lib/demo-auth.ts`
- Modify: `lib/glean.ts:20-28` (remove), `lib/glean.ts:30-34` (comment), `lib/glean.ts:102-132` (remove)
- Modify: `lib/dashboard/nl/types.ts:22` (comment)

**Interfaces:**
- Consumes: Task 1's test.
- Produces: `lib/glean.ts` exporting only `GLEAN_BASE_URL`, `getGleanHeaders`, `gleanChat`.

- [ ] **Step 1: Delete the four files**

```bash
git rm app/api/pr-placements/route.ts app/api/glean/meeting-brief/route.ts components/meeting-prep/index.tsx lib/demo-auth.ts
```

- [ ] **Step 2: Remove the two helpers from `lib/glean.ts`**

Delete `getLast7DaysRange` (lines 20-28, the function and the blank line after it) and `buildMeetingPrepPrompt`
(lines 102-132, with the blank line before it). The file then ends with `gleanChat`'s closing `}`.

- [ ] **Step 3: Reword the comment that names the deleted route (`lib/glean.ts:30-34`)**

Replace

```ts
// Glean Chat: send a single-shot prompt to Glean's chat endpoint and return
// the concatenated AI text. Mirrors the inline fetch in
// app/api/glean/meeting-brief/route.ts. Server-side only. Throws on terminal
// failure so callers can decide between retry, fallback UI, or surfacing the
// error.
```

with

```ts
// Glean Chat: send a single-shot prompt to Glean's chat endpoint and return
// the concatenated AI text. Server-side only. Throws on terminal failure so
// callers can decide between retry, fallback UI, or surfacing the error.
```

- [ ] **Step 4: Reword `lib/dashboard/nl/types.ts:22`**

Replace

```ts
/** One Glean chat message (mirrors the shape used in app/api/glean/meeting-brief/route.ts). */
```

with

```ts
/** One Glean chat message, as Glean's chat endpoint returns it (the same shape gleanChat reads, lib/glean.ts). */
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx vitest run lib/auth/api-routes.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 6: Nothing still names a deleted symbol in code**

Run: `git grep -n -E "getLast7DaysRange|buildMeetingPrepPrompt|MeetingPrepBrief|getDemoSession|demo-auth|components/meeting-prep|api/glean/meeting-brief|api/pr-placements" -- app components lib scripts e2e proxy.ts`
Expected: no output.

- [ ] **Step 7: Commit and push**

```bash
git add lib/auth/api-routes.test.ts vitest.config.ts lib/glean.ts lib/dashboard/nl/types.ts
git commit -m "chore: remove unused API routes and dead demo code" -m "Dead code, no callers. Adds a test that lists every API route, so adding one is deliberate."
git push -u origin chore/remove-unused-api-routes
```

### Task 3: Docs that point at the deleted files

**Files:**
- Modify: `ENGINEERS.md:82-83, 146, 214, 338, 352-354`
- Modify: `Guides/prplacements.md:13, 207-327, 553, 565, 573`
- Modify: `Guides/gleansdk.md` (note after the staleness note, line 12), `README.md:31`
- Modify: `.env.example:60`

**Interfaces:** none.

- [ ] **Step 1: `ENGINEERS.md`**
  - Delete lines 82 (`pr-placements/route.ts ...`) and 83 (`glean/meeting-brief/route.ts ...`) from the `api/` tree.
  - Delete line 146 (`meeting-prep/index.tsx ...`).
  - Line 214: `  glean.ts                                   # Glean AI client (dashboard NL proposer, Peec AI synopses)`
  - Line 338: `- PR placements data types and normalizers; the report fetches articles server-side in \`components/report-sections/pr-placements/index.tsx\``
  - Lines 353-354 under `### Glean (\`lib/glean.ts\`)` become:
    `- Backs the configurable dashboard's natural-language proposer (\`lib/dashboard/nl/glean-chat.ts\`) and the Peec AI synopses (\`lib/peec/*synopsis.ts\`)`
    and `- Server-side only`
  - Keep line 121 (`report-sections/pr-placements/`) and line 369 (the report's build-status row).

- [ ] **Step 2: `Guides/prplacements.md`**
  - Line 13 becomes: `3. Server-side fetch in the report section (\`components/report-sections/pr-placements/index.tsx\`), so the API key stays off the client`
  - Replace lines 207-327 (sections 4 and 5, up to and including `Install SWR if not already present: ...` and the blank
    line after it) with:

    ```markdown
    ## 4. Data fetching

    The report fetches articles on the server, in `components/report-sections/pr-placements/index.tsx`: a POST to
    Event Registry's `article/getArticles` with `next: { revalidate: 3600 }`, using `NEWSAPI_AI_KEY` read on the server.
    It normalizes the answer with `normalizeArticle` and `calcSummary` from `lib/newsapi.ts`. There is no API route and
    no client-side hook for this module.

    ## 5. (Removed)

    Section 5 described a client-side data hook. The report fetches on the server instead (section 4).

    ```
  - Line 553 becomes: `- The report's server-side fetch uses \`next: { revalidate: 3600 }\`: at most 1 fetch per client per hour`
  - Line 565 (the `swr` row of the dependencies table): delete it. It existed only for the removed hook; `swr` is not
    in `package.json` and `hooks/usePRPlacements.ts` never existed.
  - Line 573 becomes: `- **Never expose \`NEWSAPI_AI_KEY\` in client-side code**: fetch only on the server, in the report section`
  - Line numbers above are before the section 4-5 replacement; edit from the bottom up.

- [ ] **Step 3: `Guides/gleansdk.md` and `README.md:31`**
  - In `Guides/gleansdk.md`, after the staleness note (ends line 11), add a blank line and:

    ```markdown
    > **Removed in October 2026.** The meeting-prep widget (`components/meeting-prep/`) and its route
    > (`app/api/glean/meeting-brief`) were removed. `lib/glean.ts` now backs the configurable dashboard's
    > natural-language proposer (`lib/dashboard/nl/glean-chat.ts`) and the Peec AI synopses (`lib/peec/*synopsis.ts`).
    ```
  - `README.md:31` becomes:
    `| \`Guides/gleansdk.md\` | Glean guide: the meeting-prep widget it describes was removed in October 2026; \`gleanChat()\` / SDK usage is current; **ignore its "Existing Platform Context"** (stale Next 15 / \`clients.config.ts\`) | 🟡 mostly current |`

- [ ] **Step 4: `.env.example:60`**

Replace `# ── Glean (internal meeting-prep brief) ──────────────────────────────────────` with a header of the same total
width: `# ── Glean (dashboard NL proposer, Peec AI synopses) ` padded with `─` to the original length.

- [ ] **Step 5: No doc still points at a deleted file**

Run: `git grep -n -E "api/pr-placements|meeting-brief|components/meeting-prep|meeting-prep/index|demo-auth" -- . ':!docs'`
Expected: only `Guides/gleansdk.md` (the new note, and its old body, which the note marks as removed) and nothing in
`ENGINEERS.md`, `README.md`, `Guides/prplacements.md`, `.env.example` or code.

- [ ] **Step 6: Commit and push**

```bash
git add ENGINEERS.md Guides/prplacements.md Guides/gleansdk.md README.md .env.example
git commit -m "docs: drop references to the removed API routes and widget"
git push
```

### Task 4: Full check and local smoke

- [ ] **Step 1: Full check, exactly as CI**

```bash
rm -rf .next
DATABASE_URL=postgresql://ci:ci@db.invalid/ci make check
```

Expected: typecheck clean, every test passes (the count includes `lib/auth/api-routes.test.ts`), RSC check clean, build
succeeds and its route list has no `/api/pr-placements` and no `/api/glean/meeting-brief`.

- [ ] **Step 2: Local smoke on the dev server**
  - `POST /api/glean/meeting-brief` and `GET /api/pr-placements?clientSlug=x` both return 404.
  - Signed in as staff (Thomas signs in): the PR placements report and one AEO page render without an error card.

- [ ] **Step 3: Commit the plan with the work**

```bash
git add docs/superpowers/plans/2026-10-12-remove-unused-api-routes.md
git commit -m "docs(plan): remove unused API routes"
git push
```

Then the final whole-branch review (fresh reviewer, opus), the PR to `dev` titled "chore: remove unused API routes and
dead demo code → dev", and Paul's code review. Promotion waits on Paul's answer about shipping early.
