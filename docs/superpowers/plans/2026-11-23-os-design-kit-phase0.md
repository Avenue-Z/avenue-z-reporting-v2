# Organic Social design kit, Phase 0: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin how the Social Listening tab renders, then move its look (stylesheet, charts, frames) into one shared
Organic Social kit, with nothing changing on screen.

**Architecture:** Snapshot tests first, on the code as it is on `dev`. Then a pure move: three files go to
`components/report-sections/organic-social/design/` and every Social Listening file imports them from there. The
snapshots must not change.

**Tech Stack:** Next.js 16, React 19, CSS modules, Vitest with jsdom and Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-23-organic-social-design-overhaul.md`, section 6, Phase 0 (approved in #484).

## Global Constraints

- No visual change. No other tab, report or client changes; Social Listening is the only user of these files today.
- Files change only under `components/report-sections/organic-social/`, plus this plan.
- `analysis.tsx`, `posts.tsx`, `pills.tsx`, `trends.tsx`, `upload.tsx`, `brand.tsx`, `industry.tsx` and `section.tsx`
  stay in `social-listening/`; they only change their import paths. The analysis box stays Social Listening's own
  (spec decision (a): the other tabs keep the Tiptap editor).
- Standard gates on the last commit: `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run check:rsc`.

## Two facts the tasks depend on (measured 2026-11-23)

1. **Test class names carry a path hash.** A CSS module class renders in Vitest as `_card_e1fd3b`, with a suffix derived
   from the file's path. Moving the stylesheet changes every suffix, so the snapshots strip it
   (`/_([A-Za-z][A-Za-z0-9]*)_[0-9a-f]{6}\b/g` becomes `$1`). Without that, Task 2 would fail its own proof for a reason
   that changes nothing on screen.
2. **The stylesheet moves whole.** It has rules that combine a kit class with a Social Listening class, such as `.card .comm`
   (`sl.module.css:149`), and two CSS modules can't reference each other's classes. Splitting it would break
   those rules silently. Separating kit rules from tab rules is a Phase 1 decision.

## Review Focus

- **The PDF export.** It prints the client view whoever exports, brand then industry. Pinned by the export snapshots.
- **The client view.** A client must see no staff control (upload slot, staff notes, edit buttons). Pinned by the
  client snapshot.
- **The industry topic.** It renders a different set of sections. Pinned by its own snapshot.
- **The CSS variables.** The kit's colours come from variables on `.root` (`sl.module.css` lines 5-27), which
  `section.tsx` puts on the tab's wrapper. The move keeps that; Phase 1 must wrap any other tab the same way.
- **Empty data.** `LineChart` renders nothing on empty data (`artifact-charts.tsx:67`). Unchanged here and noted for
  Phase 1 (spec section 7).

---

### Task 1: Snapshot the Social Listening tab as it is today

**Files:**
- Create: `components/report-sections/organic-social/social-listening/section.snapshot.test.tsx`
- Create (generated): `components/report-sections/organic-social/social-listening/__snapshots__/section.snapshot.test.tsx.snap`

**Interfaces:**
- Consumes: the mocks, fixture workbook (`buildWorkbook`, `parseTalkwalkerExport`) and `show()` pattern of
  `section.test.tsx:9-60`, copied, not imported (a test file must stand alone).
- Produces: five named snapshots that Task 2 must leave unchanged.

- [ ] **Step 1: Write the test.** `normalize(html)` strips the class hash per fact 1. Five tests, each
  `expect(normalize(container.innerHTML)).toMatchSnapshot()`:
  - `staff, brand` (`role: 'INTERNAL_ADMIN'`, `topic: 'brand'`)
  - `staff, industry` (`topic: 'industry'`)
  - `export, brand` (`exporting: true`)
  - `export, industry` (`exporting: true, topic: 'industry'`)
  - `client, brand`: `role: 'CLIENT_VIEWER'`, `email: null`, with every brand box approved via `approvedBox`.
  - Plus one guard test: `normalize` keeps every class name and removes only the six-character suffix.
- [ ] **Step 2: Run it twice.** `npx vitest run components/report-sections/organic-social/social-listening/section.snapshot.test.tsx`.
  The first run writes 5 snapshots; the second run, unchanged, must pass (the output is deterministic).
- [ ] **Step 3: Check the snapshots** contain the chart SVGs, the KPI tiles and no hash suffix
  (`grep -c "_[0-9a-f]\{6\}\"" ` on the `.snap` file returns 0).
- [ ] **Step 4: Commit** `test(social-listening): snapshot the tab before the design kit move`.

### Task 2: Move the stylesheet, charts and frames into the kit

**Files:**
- Move: `social-listening/sl.module.css` to `design/kit.module.css`
- Move: `social-listening/artifact-charts.tsx` to `design/charts.tsx`
- Move: `social-listening/cards.tsx` to `design/frames.tsx`
- Modify (imports only): `social-listening/{analysis,brand,industry,pills,posts,section,trends,upload}.tsx`

**Interfaces:**
- Produces: `design/charts.tsx` exports `Change`, `Kpi`, `Key`, `LineChart`, `Donut`, `Legend`, `HBars`, `MediaShare`,
  `YtdColumns`, `PointLines`, `DailyStack`, `Cloud`, unchanged. `design/frames.tsx` exports `SlSection`, `SlCard`,
  `StaffNote`, unchanged. `design/kit.module.css` keeps every class name.

- [ ] **Step 1: Move with `git mv`** so history follows. Inside the moved files, change only the self-imports
  (`./sl.module.css` to `./kit.module.css`) and the header comment's first line to name the new path and say it is the
  shared Organic Social kit, first used by Social Listening.
- [ ] **Step 2: Update every import** in the eight Social Listening files to `../design/...`. No other change.
- [ ] **Step 3: Prove nothing moved on screen.** `npx vitest run components/report-sections/organic-social` passes
  with the Task 1 snapshots unchanged (no `-u`), and `git diff --stat` shows the `.snap` file untouched.
- [ ] **Step 4: Prove nothing else references the old paths.**
  `grep -rn "sl.module.css\|artifact-charts\|/cards'" app components lib` returns nothing.
- [ ] **Step 5: Gates.** `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run check:rsc`, all clean.
- [ ] **Step 6: Commit** `refactor(organic-social): move the Social Listening look into a shared design kit`.
