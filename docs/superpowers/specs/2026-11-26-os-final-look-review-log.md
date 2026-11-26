# Review log: the last look fixes spec

## Round 1 (2026-11-26, fresh reviewer, fixed checklist)

6 MAJOR, 7 MINOR, no BLOCKER. I checked every MAJOR against the code before fixing it.

| # | Sev | Finding | Fix in the spec |
|---|---|---|---|
| 1 | MAJOR | The glow and 40px gap missed the AEO Informed and Social Listening tabs, which return before `kit` is worked out | L1 names every kit tab; L2 adds the AEO tab (`aeo-informed/section.tsx:89`); Social Listening gets the glow |
| 2 | MAJOR | "Not an export" is an input most tabs don't have | The glow carries `data-export-hide` (`app/export/export-theme.css:53`) |
| 3 | MAJOR | "+ Add post" is a plain `.tbtn`, not dashed (`index.html:1050`) | Citation corrected; "+ Add annotation" is plain `kit.tbtn` |
| 4 | MAJOR | In a preview the boxes would resolve a client's month (`commentary/monthly.tsx:36`) while the parts show staff's | Boxes keep the real role for the month and get client rights only |
| 5 | MAJOR | The deep-link routes render the tab without `slview` | They parse and pass it |
| 6 | MAJOR | L5 edits `shared/`, which other departments use | `shared/` added to the allowed files, with a byte-for-byte test of other departments' boxes |

**MINOR, for the plan (no spec change, no further round):**
- 7: name the component that renders the toggle (it must sit above the Insights box, so in the synchronous
  `OrganicSocialReport`, `index.tsx:86-91`, which can't read the role) and its gap (artifact `margin-top: 28px`,
  `index.html:115`).
- 8: wrap `PreviewToggle` in `kit.root`, since `.btn`'s variables live on `.root` (`kit.module.css:6-27, 49`).
- 9: the Insights-to-first-part 40px needs `commentary@2` pinned; Tailwind v4 `space-y` sets `margin-block-end` on
  `:where(> :not(:last-child))`, so the box's own margin wins rather than collapsing. Measure it.
- 10: Social Listening's note text field (`social-listening/notes-panel.tsx:18`) takes `field('kit')` (`control-look.ts:20`).
- 11: citations: `kitActive` is at `index.tsx:189`; Social Listening's frame rule at `analysis.tsx:110`; the AEO section
  never reads `role` (`aeo-informed/section.tsx:43`), so it isn't a preview consumer.
- 12: the dashboard landing redirect drops `slview` (`dashboard/.../reports/page.tsx:180-187`); keep it there.
- 13: record test 1's snapshots with a client role (the staff toggle is new); add a test for the glow's export hiding and
  one for PDF spacing.

Added on my own after round 1: the acceptance measurement records every chart's rendered size before and after.

## Round 2 (2026-11-26, changed lines only)

4 MAJOR, 5 MINOR, no BLOCKER. Every cited line in the changed text checked out. No round 3.

- **Fixed (one fix, no choice):** test 4 now asks for plain `kit.tbtn`, not the dashed button; test 2 now covers every kit
  tab and checks `data-export-hide` instead of "not exporting".
- **Decisions for me (a choice in each):**
  - D1. Social Listening is always on the kit for every client (`social-listening/section.tsx:37`), so its glow either
    ignores `designFrom` (an exception to the rules at the top) or waits for it.
  - D2. What a preview's Insights box shows. `monthly.tsx` uses the viewer for the cutoff (`:50`), the client month list
    (`:56`) and the staff-only "client opens" notes (`:62`). Either the preview shows the entry a client gets for that
    month, the one the PDF already prints (`clientMonthEntry`, `:57`), with no staff notes or history, or something else.
- **MINOR, for the plan:** the AEO tab's early returns (`aeo-informed/section.tsx:67-74`) skip the glow; AEO's boxes take
  the kit from `monthlyCommentary` while its body takes it from `setting.design` (`section.tsx:87`), so they can differ;
  name `deep-link-parity.test.tsx` and the deep-link `searchParams` type (`:93`) in L5; the acceptance check compares the
  client view for September (the staff toggle is new there); chart-size tolerance is 1px for subpixel rounding.
