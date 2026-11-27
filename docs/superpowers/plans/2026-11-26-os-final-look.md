# Organic Social: the last look fixes (plan, 2026-11-26)

**Spec:** `docs/superpowers/specs/2026-11-26-os-final-look.md` (review log beside it; glow trial in
`docs/findings/2026-11-26-os-glow-trial.md`). One PR off `dev`, branch `feat/os-final-look`. Every line below was read
on this branch (dev 5c325dd4 plus docs). Execution: inline, test first, each new test seen failing.

## Global constraints

- Under the kit look only; the old look, clients without `designFrom`, and Renaissance stay byte-identical. Exceptions: the
  staff-only preview toggle (L5) and Social Listening's glow (D1).
- No change to `app/layout.tsx`, `app/globals.css`, the dashboard or portal layouts, or another department's file.
  `components/report-sections/shared/` changes only by an optional field other departments never pass.
- Values copied from the artifact (`index.html` lines cited in the spec).
- Checks before the PR: `tsc --noEmit`, eslint on changed files, `npm run check:rsc`, `vitest run --maxWorkers=2`.

## Review focus (what tests can't fully show)

1. A preview on a month a client can't open yet: parts and boxes must show the same month (D2).
2. The glow on `main` must never reach a non-Organic Social page, the PDF, or an old-look month.
3. The 40px gaps with Tailwind v4 `space-y` (margin-block-end on all but the last child) plus the boxes' own margins:
   measured on the page, not reasoned.
4. Chart sizes before and after (round 2's donut lesson): measured, 1px tolerance.
5. The Suspense key now carries the preview state for every Organic Social view: per-view chart state must reset.

## Task 0. Pin the old look first

Files: new `components/report-sections/organic-social/final-look.snapshot.test.tsx`.
Record, on today's code, the markup of: the platform tab's old look as a client (Instagram, a month before
`designFrom`), Overview, Influencer, the AEO tab without `design: "kit"`, the old Insights and Recommendations boxes (client
and staff), and the old-look Add annotation buttons (daily and YTD). Client role for the tabs (the staff toggle is new).
These snapshots must not change in any later task. Commit.

## Task 1. L4, the staff Insights frame

Files: `components/report-sections/commentary/commentary-kit.module.css`, `commentary-panel.tsx:123,130,133`,
`commentary-kit-section.test.tsx` (or `commentary-kit.test.tsx`).
- New rule `.boxStaff { border-color: rgba(255,252,96,0.22); background: rgba(255,252,96,0.035); }` (artifact `:217`,
  the kit's `.comm`, `kit.module.css:166`).
- `commentary-panel.tsx:130`: kit box class is `bx.box` plus `bx.boxStaff` when `capabilities.canEdit`. The export box
  (`:264`) stays `bx.box`.
- Tests: an editor gets `boxStaff`; a non-editor and the export don't; the old look is unchanged (Task 0).

## Task 2. L3, Add annotation and Social Listening's note controls

Files: `organic-social/trends.tsx:212-219`, `organic-social/ytd-notes-panel.tsx:102-106`,
`social-listening/notes-panel.tsx:14-18, 70-74, 93, 140-158` and its form box, their tests.
- Kit Add annotation: `no-print ${kit.tbtn}` (daily), `kit.tbtn` (YTD), label "+ Add annotation". Old look unchanged.
- Social Listening (always kit): Add annotation `s.tbtn` with "+ Add annotation"; Save draft and Cancel `noteButton('kit')`;
  `NoteActions look="kit"`; the select and the text input `field('kit', ...)`; the form box `noteBox('kit', lead)`.
- Tests: class and label per button on the kit; old look's `PILL` and "Add annotation" kept.

## Task 3. L2, 40px between sections

Files: `organic-social/index.tsx:201-212` (`OrganicSocialBody`'s parts), `commentary-panel.tsx:123,130`,
`aeo-informed/section.tsx:89`, kit CSS.
- Under `kit`, the parts render inside one wrapper with the kit's 40px column gap and a 40px bottom margin; without
  `kit`, the fragment is unchanged.
- Kit boxes: `mb-10` in place of `mb-8` (Tailwind v4 `space-y-8` sets margin-block-end on every child but the last, and
  the box's own margin decides; measured in Task 6).
- AEO kit: `space-y-10` in place of `space-y-8` under `kitLook` only.
- Tests: the wrapper and classes under the kit only.

## Task 4. L1, the glow

Files: `design/kit.module.css` (new rule), `organic-social/index.tsx` (marker under `kit`), `aeo-informed/section.tsx`
(marker under `kitLook`, placed before the early returns so every state of a kit month carries it),
`social-listening/section.tsx` (marker always, not when exporting).
- Marker: `<span hidden aria-hidden className={kit.glowMark} data-export-hide="" />`.
- Rule: `:global(main):has(.glowMark) { background: <two gradients>, #000; background-attachment: fixed; }`, values from
  `index.html:39-43`. If CSS Modules refuses the selector as impure, stop and bring it back.
- Tests: the marker renders once on each kit tab and never on the old look; the stylesheet holds the exact rule
  (read as text, like `kit-svg-rule.test.ts`).

## Task 5. L5, Preview as client on every Organic Social tab

Files: `app/dashboard/[clientSlug]/reports/page.tsx` (`:108` pass the flag for every Organic Social view; `:180-187`
landing redirect keeps `slview`; `:259` already keeps it; `:357` Suspense key), the same in
`app/portal/[clientSlug]/reports/page.tsx` (`:131`, `:223`, `:258`, `:365`), both deep-link pages
(`app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx:82, 93`, `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx:100`),
`organic-social/index.tsx` (`OrganicSocialReport` gets `preview`; a toggle row above the Insights box for staff, in
`kit.root`; `OrganicSocialBody` swaps role and email for the parts), `shared/shared-parts-header.tsx` and
`shared/parts/registry.tsx` (optional `preview` on `SharedCtx`, passed to `CommentarySection`), `commentary/index.tsx` and
`commentary/monthly.tsx` (preview mode: real role for the month, the client's entry, client rights), the deep-link parity
test, `lib/organic-social/social-listening/params.ts` (no change; the same `slview=client`).
- The toggle row needs the role: `OrganicSocialReport` is synchronous, so the row is a small async server component in its
  own Suspense that reads the session and renders `PreviewToggle` for staff only.
- Social Listening's own boxes get the same month fix (they pass a client role today, `social-listening/section.tsx:136`).
- Tests: every role consumer gets a client role and no email in a preview; boxes show the client's entry for the parts'
  month; the toggle for staff only, never for a client or in the export; the flag reaches every Organic Social view and
  key; a client with the flag sees today's page; other departments' shared boxes are byte-identical with no flag.

## Task 6. Measure against the artifact and Social Listening

Local app on the dev database (`notes-test`, November = kit, September = old look; APFM Social Listening).
- Run the side-by-side script (`scratchpad/measure.js`, extended): glow layers on `main`, section gaps, line height,
  buttons, staff and client frames, preview, and every chart's and icon's size, before (dev) and after (this branch).
- Expected: kit month matches the artifact on every shared element; September and Social Listening unchanged except the
  deliberate L1 and L3 changes; chart sizes within 1px.
- Screenshots to my private folder for Thomas, then Paul's Slack only.

## Task 7. PR

Full checks, self-review comment, `self-reviewed` label, prove it merges clean with dev, #543 and every clean open PR.
