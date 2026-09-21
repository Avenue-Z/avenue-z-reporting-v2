# Organic Social snapshots: clients see frozen periods, not live data

Working doc for this branch. Code for the snapshot work lands here.

**The goal, in one line:** a client opening their Organic Social report sees the
numbers for a settled past period, and those numbers do not move afterwards.
Today they see a rolling window that shifts every day.

**No client identifiers in this repo.** Dash Social brand ids are secret and live
only in Neon. This repo is public. Nothing here names one, and client rows are
created directly in the database rather than in a committed script or fixture.

**Renaissance is not touched by any of this.** It is live in production in a
client's hands. See §6.

---

## 1. Why this exists

Two problems, same root cause.

A rolling window means the report reads live vendor data every time it is opened.
Numbers move between building a report and presenting it, and a client looking at
"last 30 days" in October sees a different picture than they saw in September for
what they think is the same thing. Nothing is wrong on screen, which is what
makes it hard to catch.

The recurring client deck has the same problem from the other side. It is
assembled by hand from vendor screenshots while this platform holds the same
numbers, and a deck built off a moving window cannot be reconciled with anything
later.

Both are fixed by the same change: give clients closed periods.

## 2. How freezing works today

Verified in the tree, not assumed.

`fetchTopContentFrozen` (`lib/organic-social/frozen.ts:49`) resolves a date range
to start/end and asks one question, `isPeriodOpen` (`frozen.ts:14`):

- **OPEN** (`rangeEnd` is yesterday or later) reads live and writes nothing. A
  rolling key shifts daily, so writing it would accumulate dead per-day rows.
- **CLOSED and already snapshotted** serves the stored rows and makes no vendor
  call at all.
- **CLOSED and not yet snapshotted** fetches once and inserts.

Storage is `top_content_snapshots` (`lib/db/schema.ts:379`), keyed on
`(clientId, channel, rangeStart, rangeEnd)`, with Overview stored under the
sentinel channel `ALL`.

Persistence is best effort by design. A read or write failure degrades to a live
fetch and logs, rather than blanking the section. A read that throws does not
count as proof of absence, so a transient database blip cannot overwrite numbers
that are already frozen.

## 3. The finding that shapes the work

**A rolling preset can never freeze, by construction.**

`last_N_days` resolves `end` to yesterday (`lib/date-range.ts:64`), and
`isPeriodOpen` treats yesterday as still open. That is deliberate and load
bearing: rolling windows must stay live. A named period like `last_month`
(`date-range.ts:78`) ends on the last day of the previous month. On the 1st that day is
still yesterday, so the period counts as open; it closes and freezes from the 2nd.

The default preset is `last_30_days`.

So the freeze machinery is not missing. It already does the right thing. The
reason clients see live data is that **the picker only ever hands it open
windows**. The lever is the picker, not the freeze logic.

That makes this a much smaller piece of work than "build snapshotting".

## 4. What actually freezes, and what does not

This is the real gap, and it is narrower than the section looks.

| Surface | Frozen? |
|---|---|
| Top Content | **Yes, on `top-content@2` only.** `parts/top-content.tsx:67` calls `fetchTopContentFrozen`; v1 (`parts/top-content.tsx:19`) calls live `getTopContent`. A client's version comes from its `section_templates` row |
| Followers | No. `lib/organic-social/followers.ts` queries live |
| Trends | No. `lib/organic-social/trends.ts` queries live |
| Headlines | No. `lib/organic-social/headlines.ts` queries live |
| Trend series | Not a vendor call. `lib/organic-social/trend-series.ts` only builds series from the followers and trends data |

`fetchTopContentFrozen` has exactly one caller. Every other getter in
`lib/organic-social/` goes straight to the vendor on every render.

So on a closed month today, Top Content is frozen and the three other surfaces are
live. A client would see stable post rankings sitting next to follower and trend
figures that can move underneath them. That is arguably worse than all-live,
because the inconsistency is invisible.

"Clients will not see live data" is not true until those three are covered too.

## 5. The work, broken down

**A. Closed periods in the picker.** Replace the rolling presets with settled
calendar months so a client lands on a closed window by default instead of a
rolling one. Preset list is a module constant at
`components/layout/date-range-picker.tsx:27-46`. This alone makes Top Content
freeze for every client who uses the picker normally.

**B. Per-client picker config.** The picker has zero `clientSlug` references
today, so it is one shared list for everyone. Drive it from the client's own
config so the new clients get closed periods and every existing client falls
through to today's exact list unchanged. This is what keeps §6 true.

**C. Extend freezing to the other three surfaces.** Followers, trends and
headlines need the same open/closed treatment as Top Content. The pattern
already exists and is proven; this is applying it, not inventing it. Each gets
its own storage key on the same `(client, channel, range)` shape.

**D. Decide who triggers the first freeze.** A period only freezes on the first
render of a closed window. Nothing schedules it, and the cache-warm cron will not
do it because that cron renders a rolling window. A client could be the first
person to open a given month, which means they pay the fetch. Either warm it
deliberately or accept the first-open cost.

Order matters: A and B are independent of C. A alone is a real improvement and
ships on its own.

## 6. Renaissance is not touched

Renaissance is live in production in a client's hands and cannot change at all,
config row or rendered output.

Every item in §5 is additive and gated. B is the mechanism: a client with no
picker config resolves to today's exact preset list, byte identical, and
Renaissance's row is never written. C changes shared getters, so each one has to
be demonstrated as a no-op for a client that is still on a rolling window, which
Renaissance is.

Proof, not assertion. There is a pre-change baseline of the Renaissance row in
all three environments plus a hash of every file on its render path, and a
read-only drift check that fails if either moved. The check runs against the
production row, because staging is not a faithful mirror: Content Impact is
hidden in prod and visible on staging. The baseline and the check live outside
this repo, on my machine, because the baseline holds production data and this
repo is public.

Known gap in that baseline: it does not yet cover shared components like the date
picker. Widening it is a prerequisite for A and B, not a follow-up.

## 7. Decisions so far

Each decision carries who made it and when, so it maps back to Jasmine, who
approves every decision on this work. D1 to D7 went to her in the decisions for
approval doc, and she answered on 2026-09-21.

| # | Decision | Decided by | Date | Status |
|---|---|---|---|---|
| D1 | Renaissance does not change: not its config row, not what it renders. | Me | 2026-09-17 | Approved by Jasmine, 2026-09-21 |
| D2 | Three new clients, Organic Social only: A Place For Mom, Joy of Life, and a third the outline calls Kenect Nashville while our records say Akara Living. Which name to use is her question 1. | Me | 2026-09-17 | Answered 2026-09-21: label it "Akara Living, Kenect Nashville"; the page the team manages is the Kenect Nashville Instagram |
| D3 | Channels are per client and per channel, opt in. A client not named gains nothing. TikTok is for Joy of Life only. | Me | 2026-09-17 | Sent to Jasmine; matches her outlines (only Joy of Life's has a TikTok tab) |
| D4 | The date picker becomes month and year only. No rolling presets, no weeks, no quarters. | Kyleah, Organic Social team | 2026-09-17 | Approved by Jasmine, 2026-09-21 |
| D5 | The Organic Social team sees the current month live, updating daily. | Me | 2026-09-17 | Approved by Jasmine, 2026-09-21 |
| D6 | Clients see only finished months. A month opens to them on the 12th of the next month (August on 12 September), or the Monday after when the 12th falls on a weekend. This follows the team's cadence: wrapped by the 5th, presented on the 12th. | Me, from the Organic Social team's cadence | 2026-09-17 | Approved by Jasmine, 2026-09-21 |
| D7 | A month's numbers lock when it ends and never move again. | Me | 2026-09-17 | Approved by Jasmine, 2026-09-21 |
| D8 | Client visibility is enforced on the server and keyed on the client's own config, not on role, and not only in the dropdown. | Follows from D1 and D6 | 2026-09-17 | Follows |
| D9 | Renaissance keeps today's live rolling picker. | Follows from D1 | 2026-09-17 | Follows |

**Why D8 and D9 are not optional.** Renaissance has client logins in production,
so a restriction keyed on role would change what its client sees, which D1
forbids. Keying it on the client's own config lets Renaissance, which has none,
fall through unchanged. And the date range is read from the URL with no
validation today (`app/portal/[clientSlug]/reports/[reportSlug]/page.tsx:118`),
so filtering the dropdown alone would be cosmetic: a client could reach the
current month by editing the URL.

**What D7 depends on.** Only Top Content freezes today (§4). Jasmine's question 4
asked whether the first release may lock top posts only. She didn't follow the
question, but her yes to D7 settles it: everything a client sees must lock
before any client sees a month. Her answer to question 10 (no client access until
the team approves internally) means an internal first release may lock Top
Content only, since only the team sees it.

**Her other answers that shape this PR (2026-09-21):** history starts from August
2026, because dashboard reporting starts in October with August and September
(question 2); no January to August numbers are needed (question 3); and Joy of
Life's August is redone with TikTok (question 5). The engineering questions below
stay open.

## 8. Open questions

1. **How far back does the picker go?** A list of every month since the client
   was onboarded grows forever. A fixed window of the last N months is simpler
   but cuts off history someone may want. Jasmine's answer sets the start:
   August 2026 (question 2). Whether to cap the list later is not urgent.
2. **What does a client see for a month with no snapshot and no data?** A frozen
   empty window is stored and served as empty, deliberately. An unsnapshotted
   month is indistinguishable from it until something renders it.
3. **Backfill.** Snapshots are frozen blobs, so adding a field later does not
   backfill existing rows. Decide whether historical periods get re-fetched or
   whether new fields simply start from the next period.
4. **Owned versus influencer.** Designations are re-resolved live rather than
   frozen, so a post reclassified after a period froze changes which posts appear
   in that frozen period. Decide whether designations freeze with the snapshot.
5. **Do the other three surfaces need per-channel keys**, or does Overview's `ALL`
   sentinel cover them.

## 9. Out of scope here

Client onboarding. Adding an Organic Social client is a database change only: one
`clients` row with `enabled_reports` of `organic-social` and a
`dash_social_config`, plus `users` rows where a client login is needed. No code,
no migration, no committed configuration. Done directly in Neon, per environment.

The deck itself. Driving the PowerPoint from this data is downstream of having
frozen periods to drive it from, and is tracked separately.
