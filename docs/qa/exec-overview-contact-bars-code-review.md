# Contact Creation bars: resolve heights, fill green, add hover, date axis — Code Review Record

**Scope.** PR #223, branch `fix/exec-overview-contact-bar-heights`, diff range `310df98^..423a216` (three commits). Four files: `contact-pacing.tsx` and its spec, a ten-line change to `lib/salesforce/contacts.ts`, and the new `lib/salesforce/iso-week.ts`. No unrelated code.

**This document changes no code.** Every fix it names is tracked in §5 as a follow-up.

Reviewed against PR #220, whose review record is `docs/qa/exec-overview-crm-wiring-code-review.md`. This PR repairs a defect that record did not catch, for a reason worth stating up front: the bug was invisible to every test in the repository.

---

## 1. How it works

### 1.1 Why the bars were blank

Each bar's height is a **percentage** of the tallest week: `height: ${(b.contacts / max) * 100}%` (`contact-pacing.tsx:133`, `max` at `:51`). A percentage height resolves against the containing block's height, and if that block's height is `auto`, the percentage resolves to `auto` as well, which is zero for an element with no content.

The original markup nested each bar inside a per-week column. The row carries `h-32` (a definite 8rem) and `items-end`. That second class is what did the damage: `align-items: flex-end` overrides flex's default `stretch`, so the column was sized by its content rather than filled to the row's height. The column's height was therefore indefinite, every bar's percentage resolved to zero, and only the week labels below them drew.

The one visible artifact confirms the mechanism rather than merely fitting it. The in-progress bar carries `border-t-2 border-dashed`, and a border paints even at zero height, which is the thin dash that appeared above the last week. Completed bars were a background colour with no border, so they vanished outright.

### 1.2 What makes the percentages resolve now

Bars and labels are two sibling tracks (`:113` bars, `:154` labels), and every element between a bar and the `h-32` row carries a definite height. There is exactly one such element: the hover wrapper at `:123`, `group relative flex h-full flex-1 flex-col justify-end`. `h-full` is `height: 100%` against a definite 8rem parent, so it is itself definite, and `justify-end` sits the bar on the row's baseline.

Both tracks use the same `flex-1` cells and the same `gap-1`, so labels stay under their bars. Every bucket renders a label cell whether or not it carries text; dropping the empty ones would let the remaining labels slide out of alignment.

### 1.3 Where the green comes from

Completed bars take `CHART_COLORS.positive` (`#60FF80`) at `:136`. That is the same constant the **Online Contacts** journey card uses in `stages.ts`, and both are driven by the same `WeeklyContacts` data, so the card and the block below it now read as one series. The in-progress week uses the same hue at `33` alpha with the dashed cap, which keeps it the same series while marking it unfinished.

### 1.4 What the hover says, and why it is not a client component

The tooltip at `:140` is the pure-CSS `group` / `opacity-0` / `group-hover:opacity-100` pattern already used by `components/report-sections/ga4/session-depth-funnel.tsx:17-29`. No JavaScript and no `'use client'`, so `ContactPacing` remains a server component and `check:rsc` still passes.

Text is `Week of {date} · {n} contacts` (`:143`), and the final bar adds `so far, {n} of 7 days` (`:142`), so a shorter in-progress bar is not read as a decline. `countLabel` (`:13`) singularises, because these strings are the only place a single contact is named and "1 contacts" on a client-facing tooltip undermines the figures beside it.

The hover target is the full column, not the painted bar, which is why the wrapper exists at all. A 42-contact week against a 180 maximum is roughly 30px tall; hovering that reliably is not something to ask of a reader.

### 1.5 How the axis decides which weeks get a label

Week numbers (`W01`…`W35`) are how `transformWeeklyContacts` keys its buckets, not how a year reads, and 35 labels on 35 cells is a smear. The axis now labels the **date each week opens**, thinned to one anchor per month:

- `starts` (`:57`) converts each ISO week key to its Monday via `isoWeekStart`
- `opensMonth` (`:58`) marks a bucket whose Monday falls in a different month from the previous bucket's
- `labelled` (`:64`) is `opensMonth`, plus the first bucket **unless** the second bucket is itself a month change

That last exception is not defensive padding. ISO week 1 of 2026 opens on **2025-12-29**, so without it `Dec 29` and `Jan 5` would print on adjacent cells at the narrowest point of the chart. Rendered against live data the rule yields 8 labels across 35 bars: `Jan 5, Feb 2, Mar 2, Apr 6, May 4, Jun 1, Jul 6, Aug 3`.

`dateLabel` (`:23`) uses a fixed `MONTHS` array rather than `Intl.DateTimeFormat`, because this renders on the server and a locale-dependent month name would make the axis differ between environments and its assertions differ between machines.

### 1.6 Why `isoWeekStart` moved

`lib/salesforce/iso-week.ts` is new and holds one function, previously private to `contacts.ts`. It is now imported by both the transform that builds these week keys and the axis that reads them back. Two copies of that arithmetic would be free to drift, and a drift there would move every label by a week with nothing failing.

---

## 2. Verification method

**The emitted heights were measured before anything was changed.** A throwaway spec rendered `ContactPacing` with 35 realistic buckets and printed the inline styles: 35 bars, values such as `28.37837837837838%`, all correct. That is what established the defect was resolution rather than computation, and it is why no assertion on the style string could have caught it.

**The CSS mechanism was reproduced in isolation**, outside React, as two structures with identical percentages: the original nesting renders nothing, bars as direct children of a definite-height row render correctly.

**The axis was rendered against live data**, not fixtures: `getSalesforceWeeklyContactsImpl('renaissance')` through `react-dom/server`, then the label cells and tooltips were extracted from the HTML. 35 buckets, 8 labels, first tooltip `Week of Dec 29 · 11 contacts`, last `Week of Aug 24 · 43 contacts so far, 3 of 7 days`. This is what confirmed the December edge case is live this year rather than theoretical.

**Every cited line number was checked** against the branch head `423a216` before this document was written.

**Not verified:** anything requiring a real browser. The repository has no headless browser and no layout-capable test environment; `jsdom` is the only DOM present and it performs no layout. The fix's correctness in a browser rests on the CSS specification and the isolated reproduction, not on an executed assertion. This is the same gap that let the original defect ship.

---

## 3. Findings

Sev: **●** correctness · **○** cleanup/convention. Status: CONFIRMED (proven in-tree) / PLAUSIBLE (code assumption confirmed, external trigger unverified).

| # | Sev | Status | Location | Finding |
|---|---|---|---|---|
| 1 | ● | CONFIRMED | `peec-ai/technical-audit.tsx:163-170` | The identical collapse exists outside this diff. Same `flex h-* items-end` › `flex flex-col` › percentage-height child structure. Its bars are `bg-white/[0.06]` at `h-12`, so the failure is easy to miss, but those bars are also rendering at zero height today. |
| 2 | ○ | CONFIRMED | `contact-pacing.tsx:140` | The tooltip is hover-only and `pointer-events-none`. With the axis now thinned to 8 labels, a touch or keyboard user cannot obtain any per-week figure at all: on a phone, 27 of 35 bars are unlabelled and unreachable. The previous per-bar `W##` labels at least named every bucket. |
| 3 | ○ | CONFIRMED | `contact-pacing.tsx:142`, `:50`, `:103` | The partial-week caveat now appears in **three** places on one screen: the Current Week tile's "Partial week: 3 of 7 days.", the row caption's "current week in progress: 3 of 7 days.", and now the tooltip's "so far, 3 of 7 days". PR #220's review record raised this as finding 4 when there were two. |
| 4 | ○ | PLAUSIBLE | `contact-pacing.tsx:140` | The tooltip is `left-1/2 -translate-x-1/2 w-max` with no edge collision handling. On the first and last of 35 cells it extends past the chart's bounds; whether it clips depends on whether any ancestor establishes `overflow: hidden`, which was not traced. |
| 5 | ○ | CONFIRMED | `lib/constants.ts:13`, `:26` | `CHART_COLORS.positive` and `CHART_COLORS.googleAds` are both `#60FF80`. The bars are now the same green as the Google Ads series, which is not a problem on this page today but makes the colour ambiguous if paid media is ever added to it. |
| 6 | ○ | CONFIRMED | `contact-pacing.test.tsx` (ancestor-chain test) | The regression test asserts the chain by matching the literal class `h-full`. A future refactor that gives the wrapper a definite height by another valid means (`h-32`, an explicit style) would fail the test while being correct. It over-specifies the mechanism rather than the outcome, which is a deliberate trade: no layout-capable test exists to assert the outcome. |
| 7 | ○ | CONFIRMED | `lib/salesforce/iso-week.ts`, `contacts.ts:39` | `isoWeekStart` was extracted; its counterpart `isoWeekKey` stayed behind in `contacts.ts`. The pair is now split across two modules with no stated rule for which belongs where. |

No **●** findings inside the diff. Finding 1 is a **●** because the same defect is live in another section, not because this PR introduced it.

---

## 4. Detail

### Finding 1: the same bug is still shipping in Technical Audit

`technical-audit.tsx:163-170` builds its trend bars as `flex h-12 items-end` › `flex flex-1 flex-col items-center gap-1` › `div` with `style={{ height: '${pct}%' }}`. That is the exact structure this PR removed, and it fails for the exact reason: `items-end` suppresses the stretch that would give the column a definite height.

This is where the pattern in `contact-pacing.tsx` came from, which is worth recording — the original was not careless, it copied something that looked established.

**Suggested fix.** The same split: bars as direct children of the `h-12` row, labels as a sibling track. Its bars are `bg-white/[0.06]` (roughly 6% white on a near-black surface), so confirm visually before and after; the collapse is not obvious at that contrast.

### Finding 2: the numbers are unreachable without a mouse

Before this PR every bar carried a `W##` label. After it, 8 of 35 carry a date and the remaining 27 are identified only through a CSS `:hover` tooltip that no touch device will ever fire and no keyboard can focus, since the wrapper is a `div` with no `tabindex` and the tooltip is `pointer-events-none`.

For an internal dashboard that is a minor gap. For a client-facing report opened on a phone, 27 unlabelled bars with no way to interrogate them is a real regression in what a reader can learn, traded for a large gain in what they can read at a glance.

**Suggested fix.** Either make the wrapper focusable and reveal on `focus-visible` as well as `hover`, or accept it deliberately and record the decision. The repo's `InlineTooltip` in `session-depth-funnel.tsx` has the same limitation, so this is a house-wide pattern rather than a one-off, and worth deciding once.

### Finding 3: the partial week is now stated three times

The three strings are not redundant by accident: each was added for a defensible local reason (the tile explains its own value, the caption explains the dashed bar, the tooltip explains the shorter figure). Collectively they say the same sentence three times in three registers within one screen.

**Suggested fix.** Drop the row caption. The dashed cap plus the tooltip now carry it, and the caption is the only one of the three that cannot be dismissed by not hovering.

### Finding 4: tooltip edge collision

Centring on the cell is correct for 33 of 35 bars. On the first and last, half the tooltip sits outside the chart's box. Nothing in this diff clips it, and an overflow that merely spills is harmless; an ancestor with `overflow: hidden` would truncate it instead.

**Suggested fix.** Confirm by hovering the first and last bar on the preview. If it clips, clamp the transform on the first and last cell.

### Finding 6: the regression test pins a mechanism, not an outcome

The outcome that matters — "the bar occupies its share of 8rem on screen" — is not assertable in this repository. The test therefore asserts the structural property that produces it: every ancestor between the bar and the `.h-32` row carries `h-full`.

That is a real invariant and it fails loudly if someone reintroduces the nesting. It also fails if someone satisfies the requirement differently and correctly. This was chosen deliberately over asserting nothing, and it is recorded here so the next person to trip it knows it is a proxy rather than a law.

**Suggested fix.** None now. If browser-level testing is ever added, replace it with a measured assertion.

---

## 5. Follow-ups

Tracked separately; none applied in this PR.

**Correctness, highest value first**
1. **Finding 1** — fix the identical collapse in `peec-ai/technical-audit.tsx`. It is the only finding here that is a live rendering defect in front of users right now, and it is not in this diff.

**Decide together**
2. **Finding 2** — hover-only tooltips are a house pattern, not a local choice. Decide once whether report charts must expose their values without a mouse, then apply it to both this and `session-depth-funnel.tsx`.
3. **Finding 3** — which of the three partial-week statements survives.
4. **Finding 5** — whether `CHART_COLORS.positive` doubling as `googleAds` needs separating before a paid series lands on this page.

**Cleanup**
5. **Finding 4** — confirm tooltip edge behaviour on the preview; clamp only if it clips.
6. **Finding 7** — move `isoWeekKey` alongside `isoWeekStart`, or document why the pair is split.

**Blocking the ship:** none. Finding 1 is more urgent than anything in this diff, but it is a separate branch.
