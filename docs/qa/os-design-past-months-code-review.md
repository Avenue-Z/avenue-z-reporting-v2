# Organic Social design overhaul, option B (past months keep their look): code review record

Author: Thomas Chang. "I", "me" and "my" mean me. Date: 2026-11-24.

**Scope.** #510, branch `feat/os-past-months-b`, against `dev`, diff range `90bc640f..e3086bff`, no unrelated code.
It builds `docs/superpowers/plans/2026-11-24-os-design-past-months-b.md` (Tasks 1 to 6; Task 7 is a private script
outside the repo) from the spec `docs/superpowers/specs/2026-11-24-os-design-past-months.md`.

This record changes no code. Fixes not yet made are follow-ups.

## 1. How it works

**The goal.** A client moved to the design kit keeps every month it was already sent in the look it was delivered in,
and gets the kit from one month on. That month is `dash_social_config.designFrom` (`YYYY-MM`), written only by the
guarded pin script in the same UPDATE as the pins. Paul chose this on #504 ("1: B"); a missing `designFrom` is the old
look (his #504 review).

**Why it can be exact.** Every kit version is the old version's own render with the frame swapped (round 2). So "the
old look" is not a copy: it is the old version itself. `lib/organic-social/kit-wraps.ts` is the table of which old
version each kit version wraps, read from the kit files, and `kit-wraps.test.ts` holds it to the registries both ways:
its keys are exactly the kit versions registered, and each kit version, when rendered, calls the render of the version
the table names and no other.

**The one rule.** `kitActive(client, monthKey)` (`lib/organic-social/design-from.ts`) is true only when `designFrom`
is a valid `YYYY-MM` and the served month is on or after it (string compare, inclusive). Absent, malformed, or no
served month: false. Every surface calls it with the same served month, which comes from the same
`lockedRangeFor(client, role, requestedRange, requestClock())` each already used.

**Where it is applied.**

| Surface | What changes | Where |
|---|---|---|
| The body (Overview, platform tabs, Influencer) | Each resolved part's version goes through `drawnVersion(id, version, kit)`; frozen snapshots too, since the map runs after `resolveSection`. The part key and the PDF block check use the drawn version | `components/report-sections/organic-social/index.tsx:183`, `:190` |
| Insights and Recommendations | `look: 'kit'` is passed only when `kitActive` holds for the served month; before it the box is exactly `@1`. The branch for a client without reporting months applies the rule with no month, so never the kit | `components/report-sections/commentary/monthly.tsx:40`, `commentary/index.tsx:32` |
| AEO Informed Social | New `monthKey` prop from the body; `design: "kit"` applies only when `kitActive` holds | `aeo-informed/section.tsx:87`, `organic-social/index.tsx:124` |
| Social Listening | Unchanged: it asks for no `look`, so the gate never adds one | `social-listening/section.tsx` |

A malformed `designFrom` is logged once per render by the body only (its parts path and its AEO branch), with the
slug and the value cut to 32 characters, never the brand id.

**The pin check.** `kitPinProblems(template, before, after)` (`lib/organic-social/kit-pin-check.ts`) resolves the
section before and after a pin and refuses any kit version that does not replace exactly the version it wraps, so a
past month can never fall back to a version the client never drew (for example a client on `ytd-review@4` cannot take
`@5`, which wraps `@2`). `designFromWriteProblem` refuses a `designFrom` a client can already see, a config that already
has one, and a config without parseable reporting months. The private pin script runs both from the checkout before it
writes.

**What does not change.** No request, lock key, getter, schema or migration. Renaissance has no `designFrom` and no kit
pin, so every function above returns its input unchanged for it.

## 2. Verification method

- **Static anchors** confirmed at the lines cited above in the branch head.
- **Executed:** `DESIGN_FROM_ROWS` (15 rows) runs through the rule, the body (Instagram tab), every branch of the boxes
  (served month, no month to serve, no reporting months) and the AEO section; each row first asserts the month it
  meant was actually served. The body tests spy on `lookup` and compare the parts, ctx and resolved part a kit client
  asks for with what the same client asked for before its pin, on Overview, a platform tab and the Influencer tab, for
  staff and a client; and compare the element tree of the body (keys, `data-export-block`).
- **Regression guards that passed before the change too:** Social Listening's box and `commentary@2` on another report
  get no `look`. Confirmed by running them against the pre-change files.
- **Gates at the head** (run locally): `tsc --noEmit` clean, `eslint` clean on every changed file, `npm run check:rsc`
  clean, `vitest run --maxWorkers=2` 458 files and 5957 tests passing.
- **Local look on dev** (`notes-test`, `designFrom: "2026-11"`, written with the guarded dev script; nothing else on the
  row changed and Renaissance's row md5 was the same before and after): as staff, September has no kit element on the
  page or the export page, November has the kit on both, including the Insights box. Renaissance has none. No console
  or server errors. October was not opened.
- **Merge check:** the branch merges clean into `dev` and with every open PR except #211, #190, #180, #165 and #146,
  each of which already conflicts with `dev` alone on the same files, none of them touched here.
- **Pin script:** read-only dry runs on staging: `--design-from 2026-11` VALID, `--design-from 2026-10` REFUSING (a
  client can already see October). Not applied anywhere.
- **Fresh review:** one whole-branch review on a fresh context, its findings below.

## 3. Findings

Sev: **●** correctness, **○** cleanup or convention. Status: CONFIRMED (proven in tree) or PLAUSIBLE (code assumption
confirmed, external trigger unverified).

| # | Sev | Status | Location | Finding |
|---|---|---|---|---|
| 1 | ● | CONFIRMED | `lib/organic-social/design-from.ts:50` | The pin check let a past `designFrom` through when `reportingMonths` parses but has a bad optional key. **Fixed in `282dc99a`** |
| 2 | ○ | CONFIRMED | `components/report-sections/commentary/commentary-kit-section.test.tsx:103` | The Social Listening guard runs only on a month before `designFrom` |
| 3 | ○ | CONFIRMED | `lib/organic-social/kit-pin-check.ts:33` | `sharedKitPinProblems` reads "before" from the raw pins, not as the client resolves them |
| 4 | ○ | CONFIRMED | `lib/organic-social/design-from.rows.ts:11` | Test-only rows at a path that looks like app code |

## 4. Detail

**1. A bad optional key in `reportingMonths` hid the delivered months from the pin check.** `parseReportingMonths`
returns `ok: true` with a `badKey` when an optional key (`opensOnDay`, `clientMonths` and so on) is invalid, and a
client is then shown no months at all (`monthsFor`, `lib/organic-social/reporting-months.ts:174`). The delivered-month
check saw nothing and allowed, for example, `designFrom: '2026-09'` with `opensOnDay: 99`. Once the key was fixed, the
client's delivered months would have redrawn in the kit. Fix (applied): refuse when `badKey` is set, naming the key.
Test: "reportingMonths with a bad optional key is refused", RED then GREEN.

**2. The Social Listening guard covers half the rule.** It uses `designFrom: '2026-12'` with October, where
`kitActive` is false anyway, so a change that added a look Social Listening never asked for on a kit month would still
pass. Suggested fix: run the same assertion with `designFrom: '2026-09'` too.

**3. Shared pins in the pin check are read raw.** `resolveSharedParts` drops unregistered pins and keeps duplicates;
the check's `Map` keeps unregistered pins and lets the last duplicate win. Low impact: an unregistered "before" pin is
still refused, and duplicate pins are an odd state. Suggested fix: build "before" from `resolveSharedParts`, which
needs the components registry, so it may belong in the private script.

**4. Test data at an app path.** `design-from.rows.ts` is imported only by tests (its header says so). Suggested fix: a
`.fixture.ts` name or a home under `lib/test-utils/`, so app code cannot import it by mistake.

## 5. Follow-ups

- **Correctness:** none open. Finding 1 is fixed on the branch.
- **Cleanup (non-blocking, any order):** findings 2, 3 and 4.
- **Set aside on purpose, from the review:** promoting a kit version into a `section_templates` row draws the wrapped
  version for every client without `designFrom` (the spec's rule; promotion is its own admin act). Kit pins written
  before this PR (only `notes-test` on dev) count as already pinned. Renaissance's AEO setting has no `design` key on
  dev or staging (read-only check, 2026-11-24), so this PR changes no AEO look there.
- **Before staging:** the staging pin script runs with this PR in its gate, on my go only.
