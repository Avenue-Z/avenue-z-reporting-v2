# Chart annotations: design

Status: approved in chat on 2026-09-18. Waiting on Jasmine: her question 9, as she is
reviewing it, describes a different design (see the next section). Nothing is built until
she answers.
Supersedes `docs/chart-annotations.md`.

## Summary

The three new Organic Social outlines (A Place For Mom, Joy of Life, Kenect) say, on
every platform tab, "{Platform} Follower Growth Graph: needs to include annotations" and
"{Platform} Engagement Graph: needs to include annotations". This spec builds those
annotations the way the team already makes them by hand in the monthly deck: call out
the few days that spiked, say what the number was, and show the post behind it. The
team can hide any single annotation from the client.

Renaissance does not change. It renders v1 of both graphs, and everything here lives in
v2.

## Jasmine's question 9, as she is reviewing it

The decisions for approval doc Jasmine is reviewing asks, as question 9:

> Your outlines ask for annotations on both graphs. Is this what you mean? A dot on every
> day you posted, so you can see what went live when the line moved, and hovering it shows
> the post. You could add your own notes too, like "influencer post went live", written by
> your team and approved before a client sees it. One button hides them all, and any single
> one can be hidden so you can share some and not others.

That question went out before I read the team's June deck. This spec follows the deck
instead: peaks, not every posting day, and a visible row instead of hover. The question was
not reworded, so her answer is about the design it describes. How her answer maps:

- **Yes, as written.** She wants a dot on every posting day with hover. That is closer to the
  code already on this branch (commit `922a090`, one mark per posting day). I bring the
  choice between that and this spec back to her before building, and revise the spec and
  plan to whatever she picks.
- **She prefers the deck's peaks, or leaves the shape to us.** This spec as written.
- **Either way:** hiding a single annotation, the Renaissance guards and the UTC month stand,
  since her question asks for the first and the other two are ours. Written notes wait for her
  answer and follow the approval flow she confirms.

## What the team does today

Read from the A Place For Mom June 2026 deck, slides 19, 20, 26, 27, 32 and 33. The deck
is not committed here and no figure from it appears in this repository: it carries real
client numbers and the repository is public.

- **They mark peaks, not posts.** Each Follower Growth slide calls out the top 2 days.
  Each Engagement slide calls out the top 3. This holds on all six slides, across
  Instagram, Facebook and LinkedIn.
- **The number is the headline.** Each callout is the date and that day's value, in the
  form `6/25 | +N Followers` and `6/22 | N Engagements`.
- **A thumbnail explains the spike.** The post that drove it sits above the chart. Not
  every callout has one: one slide has three callouts and two thumbnails, because nothing
  went live on one of the peak days.
- **Some spikes come from content we do not own.** Two callouts on the follower slides
  credit an influencer's own post. Those posts live on the influencer's account, so a
  written note is the only way to explain them. That is Phase 2.
- **The follower chart shows daily gains, not totals.** The deck plots followers gained
  per day, small positive and negative numbers with clear peaks. The dashboard's v1
  follower graph plots total followers, which for a large account is a near-flat line
  with nothing to call out.
- **Zero-engagement days are dotted red** on the engagement slides. Deferred (Decisions).

## Scope

**Phase 1, this PR (252).**
1. Annotations on the v2 follower and engagement graphs: peak callouts with thumbnails,
   and one Annotations button that shows or hides them all.
2. The v2 follower graph plots daily net new followers.
3. The v2 graphs use the UTC calendar month, so a monthly view is exactly that month's
   days.
4. The team can hide any single annotation from the client.
5. Guards that prove Renaissance's charts and data requests are unchanged.

**Phase 2, after Jasmine answers question 9.** Written notes for spikes our
data cannot explain, with an approval flow like Commentary.

**Deferred.** Red dots on zero-engagement days. It changes how every point on the shared
chart is drawn, a wider change to a chart Renaissance also uses, for something the
outlines do not ask for.

**Not in this PR, flagged.** The outlines also ask for engagement metrics "directly
under" the engagement graph (Likes, Comments, Shares and so on). No part renders that
today and the outline scope doc (PR 250) does not list it, so it is a third net-new
build alongside annotations and YTD Review.

## Design

### 1. The follower graph shows daily gains

`follower-graph@2` plots `NET_NEW_FOLLOWERS` per day instead of `TOTAL_FOLLOWERS`. Probed
2026-09-18: every channel of all three clients, TikTok included, returns a value for all
31 August days.

`getFollowerGraph` gains an optional argument naming the metric, defaulting to today's
`followers`. Every existing caller passes nothing and gets exactly what it gets today.

The gap rule follows the metric. Total followers is a running count, so a missing day
keeps the last known value (`carry`, as today). Followers gained is a daily change, so a
missing day is zero (`zero`), the rule the engagement graph already uses.

### 2. The v2 graphs use the UTC month

Probed read-only on 2026-09-18 across all three clients' channels:

- Dash's daily points are **UTC calendar days**. A post's engagement lands on its UTC
  publish date: per-post engagements grouped by UTC day matched the daily series on 31 of
  31 days for every channel. A post published in the US evening landed on its UTC date.
- Dash treats `end_date` as inclusive. The app asks for a month in US Eastern time
  (`T04:00:00Z` on both ends), so on Instagram follower charts the last hours of the
  month's final Eastern evening fall on the next UTC day. An August chart therefore gains
  a 32nd point labelled Sep 1 that is really August 31 evening data, and its Aug 1 point
  covers only 20 hours. Facebook, LinkedIn, TikTok and every engagement series do not
  show it.

The v2 graphs ask Dash for the plain calendar dates instead, the same window Top Content
already uses. Every point is a full day, the month has exactly its own days, nothing is
trimmed, and every thumbnail comes from that month's own Top Content list.

Trade-off, accepted: the platform headline tiles still use the Eastern window, so the sum
of a month's daily net new followers can differ from the Net New Followers tile by a
handful at the month's edges. v1 keeps its window, so Renaissance is unchanged.

Both getters gain an optional window argument, defaulting to today's Eastern window.

### 3. Which days get an annotation

- **How many.** Up to 2 on the follower graph and up to 3 on the engagement graph,
  matching every slide in the deck.
- **Ranked by** that chart's own value, highest first.
- **Only positive days qualify.** A day at zero or below is never a peak, so a quiet
  account shows fewer annotations rather than calling out a flat day.
- **Ties** go to the earlier date, so the same data always produces the same annotations.
- **Neighbouring days are allowed.** The deck calls out three consecutive days on one
  slide.
- **Displayed in date order**, left to right, matching the chart.
- **Only days inside the requested window.** With the UTC window no extra day exists, but
  the rule stays as a guard.
- **Platform tabs only.** The v2 engagement graph can also sit on Overview, where several
  lines share one chart and a peak is ambiguous. On Overview it renders with no
  annotations and does not fetch posts. The outlines remove Overview for these clients
  anyway.
- **No backfill after hiding.** If the team hides a peak, the next day down does not take
  its place. Promoting a day the team never looked at would defeat the point of hiding.

Picking the peaks is a pure function over the series, fully unit tested.

### 4. What an annotation says

- Followers: `8/10 | +12 Followers`
- Engagements: `8/9 | 35 Engagements`

(Numbers here and in the tests are made up.)

Month and day, no leading zeros, no year. Followers carry a plus sign, as in the deck.
Exactly 1 reads in the singular (`+1 Follower`, `1 Engagement`). The engagement label
uses a pipe where the deck uses a dash, so both charts read the same way and no dash
character appears in the product.

### 5. The thumbnail

Each annotation shows the top post published that day, ranked by engagements (ties to
the lower post id), using the same image or video poster the Top Content cards use. The
thumbnail links to the post.

- Nothing went live that day: the annotation shows the date and number with no
  thumbnail, as the deck does.
- The image fails to load (Dash still returns a URL after the CDN purges the file), or
  there is no creative at all: the same "creative no longer available" placeholder Top
  Content uses, by the same mechanism.
- A video with no poster frame: a small muted video tile, the way the Top Content card
  keeps a live video instead of calling it gone.
- The post fetch fails: every annotation still shows, without thumbnails. A missing
  picture never costs the annotation or the chart.
- One thumbnail per annotation, as in the deck. Each chart is a single platform, so no
  platform label is needed.

**What the lookup includes.** The posts come from the Top Content fetch the section
already makes, so an annotation adds no request.

- Sponsored posts are included: the spike can be real engagement on a sponsored post.
  Whether sponsored posts belong on a client's graph follows Jasmine's answer to
  question 8.
- Instagram posts in which other accounts tagged the client are also in that list, and
  Top Content does not mark them apart. One can become a thumbnail. Separating them
  would mean changing Top Content, which Renaissance uses, so this is a known limit.
  Hiding is the remedy when it happens.
- A spike caused by content we do not own (an influencer's own post) still shows our top
  post of that day. Hiding, and in Phase 2 a written note, are the remedy.

### 6. Where annotations appear

The annotations sit in a row directly above the chart, in date order, each with its
date, value and thumbnail, and each peak day gets a dot on the line. They are not pinned
to pixel positions over the line, which would break as the chart resizes on a phone. If
every channel is toggled off, the annotations go with the chart. This row replaces the
hover card considered earlier, to match the deck.

### 7. Titles and the Annotations button

Titles follow Jasmine's outlines word for word, on v2 only:

- `follower-graph@2`: "{Platform} Follower Growth Graph", for example "Instagram
  Follower Growth Graph".
- `engagement-trend@2` on a platform tab: "{Platform} Engagement Graph". On Overview it
  keeps "Engagement Over Time".

v1 keeps "Followers" and "Engagement Over Time".

One button beside the channel buttons, labelled **Annotations**, shows or hides every
annotation and its dot. It starts on. It appears only on a chart that has at least one
annotation, so every v1 chart looks exactly as it does today.

### 8. Hiding a single annotation from the client

- **Who.** Internal Avenue Z staff only, the same rule as the Organic/Influencer
  designation (`isInternalStaff`). The control is invisible to client roles, and the
  server action re-checks the role, because a hidden control is not an authorization
  boundary.
- **What the client sees.** A hidden annotation is removed on the server before the page
  is sent: no card, no dot, nothing in the page source.
- **What the team sees.** The hidden annotation stays in place, faded, marked "Hidden
  from client", with an Unhide button. Its dot is not drawn, so the chart the team sees
  matches the client's.
- **What it is attached to.** The annotation's day on one chart: client, platform, chart
  (followers or engagements) and day. Hiding the follower annotation for 8/10 does not
  hide the engagement one. It works whether or not the annotation has a post.
- **Storage.** A new table, `chart_annotation_hides`, one row per client, platform, chart
  and day, upserted with `hidden` true or false plus who set it and when, mirroring
  `post_designations`. It is purely additive: no existing table, column or row changes.
  Not `post_designations` (a stored row there would override the #ad suggestion and
  change Top Content) and not the `clients` row (Renaissance's row lives there).
- **Where the control lives.** Inside the v2 annotation row only. Never on the Top
  Content post card, which Renaissance renders.
- **Locked months.** Hides are live, like designations: hiding on a closed month still
  applies.
- **Failure.** If the hides cannot be read (a transient error, or an environment where
  the migration has not been applied yet), clients see no annotations at all rather than
  risk showing one the team hid. The team sees every annotation without hide controls,
  and the error is logged.
- **Migration.** Applied to staging with `npm run db:migrate:staging`, which refuses any
  other database. Dev and prod need my written go-ahead and are recorded in
  `MIGRATIONS-PENDING.md`. Nothing runs automatically on merge.

### 9. What freezes on a locked month

Only the thumbnails freeze, because they come from the frozen Top Content fetch. Which
days qualify and their values come from the live graph series, so they can move until
the graphs themselves lock (PR 253, decisions doc question 4). Hides are live.

### 10. What changes from the work already on this branch

This branch currently marks every day a post went live (`post-marks.ts`) behind a Posts
button. That becomes annotating the peaks, and `post-marks.ts` is removed: the only thing
still needed from it, the post for a given day, becomes "the top post of that day". Kept:
the optional marks prop on the shared line chart (unchanged) and the v2 parts reading
posts from the frozen fetch. It also fixes a bug in that earlier commit: the engagement
graph accepted marks and never passed them to the chart.

## Renaissance

Renaissance is live in production and must not change. This rests on facts checked on
2026-09-18, not on anyone being careful.

- **It renders v1 of both graphs, from the database.** `section_templates` has rows in
  prod, staging and dev, and at runtime a row wins over the code template. All three
  environments pin `follower-graph@1` and `engagement-trend@1`. Renaissance's own
  `report_section_config` pins only Commentary, with no graph version override. The code
  template, also v1, is only the fallback.
- **Its live Organic Social view** (read from prod): Overview shows headlines,
  `engagement-trend@1`, `top-content@2` and Commentary; each platform tab shows
  headlines, `follower-graph@1`, `engagement-trend@1` and `top-content@2`. Screenshots
  taken the same day show no annotation or Posts button on either graph.
- **Every shared change is optional and does nothing by default.** The new getter
  arguments default to today's metric and window. The chart's new props render nothing
  when absent. `line-chart.tsx` is not edited. Paid Media, which Renaissance also has,
  passes no marks.
- **Proven by tests written first.** Before any change, the plan commits snapshot tests
  that render the v1 charts with real Recharts output, and tests that pin the exact Dash
  requests and gap rules of the v1 getters. None of those may change.
- **Proven against the databases.** Before merge, the `section_templates` pins and
  Renaissance's overrides are re-read in all three environments and must still say v1.
  The drift check covers Renaissance's row, users and KPI surface; it does not see chart
  output, which is why the tests above exist.

## Edge cases

| Case | Behaviour |
|---|---|
| A month with no positive days | No annotations. The chart renders as it does today. |
| Fewer peaks than the limit | Shows what exists. |
| Several posts went live on a peak day | Thumbnail is the top one by engagements, ties to the lower post id. |
| No post went live on a peak day | Annotation with date and value, no thumbnail. |
| A post published in the US evening | Lands on its UTC date, which is the day Dash counts it (probed). |
| The post fetch fails | Annotations show without thumbnails. |
| The series fetch fails | Same error card as today. |
| A post has no publish date | Left out of the thumbnail lookup rather than guessed. |
| An image was purged from the CDN, or there is no creative | The Top Content placeholder. |
| A video has no poster | A small muted video tile. |
| A channel with no account at all | No series, no annotations, same as today. |
| A day's value is null | Filled per the gap rule, so it can never be a peak. |
| A day outside the requested window | Never eligible. |
| Overview | No annotations, no post fetch. |
| The team hides an annotation | Gone for the client (server side); faded with Unhide for the team; no backfill. |
| The hides cannot be read | Clients see no annotations; the team sees all, without controls. Logged. |
| A client role calls the hide action directly | Refused by the server action. |
| Malformed hide input (unknown platform or chart, bad date) | Refused by the validator before any write. |
| A tagged post from another account is the day's top post | Shown; known limit; hide it. |
| A spike caused by an influencer's own post | Our top post of the day shows; hide it, or a Phase 2 note. |

## Testing

- **Renaissance first, before any change:** snapshot tests of v1 `FollowerGraph`,
  `EngagementTrend` (Overview and platform, channel toggles) and a Paid Media shaped
  `LineChart`, rendered with real Recharts output; tests pinning the v1 getters' exact
  Dash requests and gap rules.
- Peak picking: limit, positive only, ties, all equal, neighbours, window bounds, single
  channel, non-numeric values.
- Labels, the thumbnail lookup, and building annotations with and without posts.
- The getters' new arguments: absent means today's metric, window and gap rule; present
  means the new ones, checked on the actual request.
- The row, the thumbnail fallbacks, the Annotations button, the dots, and that a chart
  given no annotations shows none of it.
- The v2 parts with mocked data: the right metric and window are requested, the right
  annotations come out, failures degrade as specified, Overview gets none, titles follow
  the outline.
- Hiding: the permission rule, the validator, the server action (role re-check, bad
  input, a good write), what clients and staff each receive, and read failure.
- Live check before merge, read only: real August data for the three clients' channels
  produces the expected annotations and thumbnails.

## Decisions

| Decision | Decided by | Date | Status |
|---|---|---|---|
| Annotate peaks, not every post | Me, from the APFM June deck | 2026-09-18 | Pending Jasmine (Q9 as sent asks about every posting day) |
| 2 follower and 3 engagement annotations | Me, from the deck | 2026-09-18 | Pending Jasmine (Q9 as sent asks about every posting day) |
| v2 follower graph plots daily net new followers | Me, from the deck | 2026-09-18 | Pending Jasmine (Q9 as sent asks about every posting day) |
| v2 graphs use the UTC month | Me, after the probe | 2026-09-18 | Decided |
| Titles and the Annotations button follow the outlines word for word | Jasmine's outlines | 2026-09-18 | Decided |
| A row of annotations above the chart, one thumbnail each, shown by default | Me, from the deck | 2026-09-18 | Decided, pending Jasmine (Q9) |
| The team can hide one annotation from the client; internal staff only; the team sees it faded | Me | 2026-09-17 and 2026-09-18 | Decided, pending Jasmine (Q9) |
| A hide attaches to the annotation's day on one chart, not to a post | Me | 2026-09-18 | Decided |
| Hides stored in a new additive table | Me | 2026-09-17 | Decided |
| Sponsored posts can be thumbnails | Default | 2026-09-18 | Pending Jasmine (Q8) |
| No annotations on Overview | Me | 2026-09-18 | Decided |
| Written notes wait for Phase 2 | Me | 2026-09-18 | Decided |
| Red dots on zero-engagement days deferred | Me | 2026-09-18 | Decided |

