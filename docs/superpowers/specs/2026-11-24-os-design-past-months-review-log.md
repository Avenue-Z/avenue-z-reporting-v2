# Review log: 2026-11-24-os-design-past-months.md

Review history lives here, never in the spec.

## Round 1 (2026-11-24): one fresh reviewer, the fixed checklist, whole spec

No BLOCKER. Every citation in the spec checked out.

**Fixed (MAJOR):**
1. "Absent means A" and "no served month means old" contradicted each other, and the boxes outside the locked-months
   branch always take the kit (`commentary/index.tsx:22`, `:66`). Fixed: one rule table in section 3, applied by the
   body, both box branches and the AEO tab; test 9.
2. "Byte for byte as today" assumed every kit pin replaced the version it wraps; `ytd-review@5` wraps only `@2` while
   `@1` to `@4` exist (`parts/registry.ts:34`). Fixed: the pin script refuses any other replacement; test 10.

**MINOR, for the plan (no further review round):**
3. The AEO section gets only `servedRange` (`aeo-informed/section.tsx:40-42`); name the month input it reads.
4. The boxes' no-month branch (`monthly.tsx:37-42`) now follows the rule table; spell it out in the plan's task.
5. "Logs once per render" cannot hold with three or four callers; log once per caller or memoise the parser.
6. The admin save accepts unpublished kit pins (`validate.ts:53`, `report-sections.ts:88`), which gives a client A
   with no `designFrom`. Accept as A, or block kit pins there.
7. Decision 2 cites Paul's item 6 but leaves out its second half: Recommendations stays on new months. Fixed 2026-11-24 (one line added to decision 2).
8. Test 6 cannot be byte-identical: the export header stamps the export time
   (`app/export/[clientSlug]/[section]/page.tsx`, `exportStamp`). Compare the report markup without the stamp.
9. Untested outputs: the malformed-setting log, the pin script's no-reporting-months refusal, the one-write of
   `designFrom` with the pins, and `SPLIT_BASIS` reading from the table.

## Round 2 (2026-11-24): one fresh reviewer, changed lines only

Three MAJOR, each with exactly one fix and no choice, so fixed with targeted edits and reported (no round 3):
1. A failed client read cannot see `designFrom`, so the "Valid, no month, failed read" row was unreachable. Fixed: a
   failed read applies no override and draws the code template, the old look by construction (`index.tsx:147-157`);
   the boxes keep today's error path (`commentary/index.tsx:23`). The table row now covers only removed reporting months.
2. The pin script's "wrapped version" check did not say what it compares against. Fixed: the version the client
   resolves in the target environment (template row plus override, `index.tsx:152-155`, `:179`); test 10 covers a
   template-row version.
3. No step applied the rule in the boxes' non-month branch (`commentary/index.tsx:66`, look computed at `:22`). Fixed:
   section 4 step 4b.

MINOR, for the plan:
10. "as Renaissance is" (on `ytd-review@4`) cites only the registry. The source is the plan's read-only check,
    `docs/superpowers/plans/2026-11-23-os-design-phase1.md:103`; cite that.

## The plan, round 1 (2026-11-24): one fresh reviewer, the fixed checklist, whole plan

Plan: `docs/superpowers/plans/2026-11-24-os-design-past-months-b.md`. Two MAJOR, each with exactly one fix and no
choice, fixed with targeted edits:
1. Task 1's test tied the table to the code only through `defaultLabel`, which old versions share
   (`platform-headlines.tsx:34` and `outline-data.tsx:47`; all four `ytd-review` versions), so a wrong entry passed.
   Fixed: a spy on the wrapped version's own `render`, which every kit version calls (`tiles-kit.tsx:53`,
   `trends-kit.tsx:64`, `posts-kit.tsx:80`, `ytd-kit.tsx:92`, `kpi-kit.tsx:75`), and none of its siblings.
2. Some rows named months the surface tests cannot serve (a request outside the client's months is replaced,
   `reporting-months.ts:207-210`), and Task 4 filtered rows out. Fixed: every row's month is servable, each surface
   asserts the served month before the look, and no surface filters a row. The year boundary rows test `kitActive` alone.

MINOR, for the build (Task named):
11. Task 5: `index.test.tsx:112` asserts the AEO props with an exact object; add `monthKey: null` there.
12. Task 3: spec tests 3, 6 and 8 are met by the `lookup` spy and element tree plus round 2's per-version parity, not
    by `expectSameValues` on the body; say so in the PR. Add a new-month case to the ctx-equality test.
13. Task 2: the log format for a non-string value: `JSON.stringify(String(value))`, cut to 32 characters.
14. Task 2: refusing a config that already has `designFrom` is a decision (add it to the list); refuse too when
    `reportingMonths` does not parse (`reporting-months.ts:199-200` gives `months: []`, which would pass).
15. Task 7: define the validator's new arguments (the before config and `dash_social_config`), and prove only
    `designFrom` changes on `dash_social_config` before the write.
16. Task 3: log the malformed value before the `NoMonths` return at `index.tsx:172`, so a client with no months still
    logs once.
17. Task 4: "Social Listening keeps its own panel" and "another report" pass before the change; keep them, labelled
    as regression guards.
18. Task 8: name the dev pin script for the local look (a copy of the staging script with the dev host guard), or add
    it to Task 7.

## The plan, round 2 (2026-11-24): one fresh reviewer, changed lines only

No BLOCKER or MAJOR. It confirmed the spy test intercepts the wrapped render (`PRE_KIT_PARTS` holds the same part
objects the kit files call, `lib/report-sections/registry.ts:8`), that every row's month is servable for staff on
2026-11-24 (`reporting-months.ts:171-187`, October open from Nov 12, `:111`), and that each row matches the spec's
table. MINOR, for the build:
19. Task 1: restore the spies in `afterEach(() => vi.restoreAllMocks())`, as `index.test.tsx:160` does, so a failing
    row cannot leave a spy that fails the rows after it.
20. Task 3's "Tasks 4 and 5 run every row the same way" holds for Task 4 only. Task 5's rows test `kitActive` inside
    the AEO section (it is handed `monthKey`); the body's hand-off of the served month is pinned by
    `index.test.tsx:165-172` alone, so that test must assert `monthKey` for a locked month and for no month.
