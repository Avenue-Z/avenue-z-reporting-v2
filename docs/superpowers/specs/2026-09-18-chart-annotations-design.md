# Chart annotations: design

Status: approved in chat on 2026-09-18. Waiting on Jasmine's answer to question 9 of the
decisions for approval doc, which describes this design (see the next section). Nothing is
built until she answers.
Supersedes `docs/chart-annotations.md`.

**Update 2026-09-21.** Jasmine answered question 9: "This should be fine, need to see it in
action." The design stands. The rebuild drops `922a090` and `annotations.test.tsx`, keeps v2
unpublished, and gets demoed to her. On question 8 she reads sponsored as collab posts and
wants them in their own section at the bottom of the dashboard; that section already exists
(Influencer Posts).

**Update 2026-09-24.** Phase 1 is on staging. Phase 2, written notes, is specified below in
"Phase 2: written notes", and the team confirmed the reading the same day (Kyleah). The same day I
decided the callouts move onto their dots, like the deck (section 6, P2.8). The build plan is
`docs/superpowers/plans/2026-09-24-chart-notes.md`. Nothing of Phase 2 is built yet.

## Summary

The three new Organic Social outlines (A Place For Mom, Joy of Life, Kenect) say, on
every platform tab, "{Platform} Follower Growth Graph: needs to include annotations" and
"{Platform} Engagement Graph: needs to include annotations". This spec builds those
annotations the way the team already makes them by hand in the monthly deck: call out
the few days that spiked, say what the number was, and show the post behind it. The
team can hide any single annotation from the client.

Renaissance does not change. It renders v1 of both graphs, and everything here lives in
v2.

## Jasmine's question 9

The decisions for approval doc Jasmine is reviewing asks, as question 9:

> Annotations: is this what you want? Each Follower Growth and Engagement graph calls out
> its top days (2 for followers, 3 for engagement) with the date, the number, and the post
> from that day, like your team's monthly deck. The follower graph shows followers gained per
> day, as the deck does. One button hides all the callouts, and your team can hide any single
> one so the client never sees it. Written notes like "influencer post went live" come next,
> approved before a client sees them, the way Commentary works.

That is this spec. A yes approves it as written. Anything she changes goes into this spec
and the plan before anything is built. Written notes follow the approval flow she confirms.
Whether sponsored posts can be thumbnails follows her question 8.

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
data cannot explain, with an approval flow like Commentary. She answered on 2026-09-21;
specified in "Phase 2: written notes" below.

**Deferred.** Red dots on zero-engagement days. It changes how every point on the shared
chart is drawn, a wider change to a chart Renaissance also uses, for something the
outlines do not ask for.

**Not in this PR, flagged.** The outlines also ask for engagement metrics "directly
under" the engagement graph (Likes, Comments, Shares and so on). These are not net new:
every one already renders today as a Data tile (TikTok's on PR 247, minus Reposts, which
Dash does not report). For the three new clients they move from the tiles to under the
graph, which is a layout change built on PR 255, not part of annotations. The net-new
builds stay two: annotations and YTD Review. (Corrected on 2026-09-18; I first wrote that
no part renders these metrics.)

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
hover card considered earlier, to match the deck. Phase 2 also puts a written note in the
chart's own hover box (see Phase 2).

**Changed 2026-09-24 (I confirmed it that day): the callouts move onto their dots, like the
deck.** On a wide screen each callout is a card in a band above the plot, joined by a line down
to its dot, always visible and printed as it appears; neighbouring days stack into rows instead of
overlapping, and the first and last days stay inside the chart. The pixel concern above is handled
by computing positions from the chart's own plot area on every render (Phase 2, P2.8). On a
phone-width screen, under 640px, the row above the chart stays exactly as described here. This
applies to the automatic top days and to the team's notes alike.

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
- **Migration.** Applied to staging on 2026-09-24 with
  `CACHE_DISABLE=1 npx tsx --env-file=.env.staging scripts/migrate-http.ts`, the command
  `MIGRATIONS-PENDING.md` gives for staging (`:195`, `:254-256`), not
  `npm run db:migrate:staging`, which runs the timestamp-gated `drizzle-kit migrate` that file
  bans. (Corrected 2026-09-24: this line first named `npm run db:migrate:staging`.) Dev and prod
  need my written go-ahead and are recorded in `MIGRATIONS-PENDING.md`. Nothing runs
  automatically on merge.

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

## Phase 2: written notes

Specified 2026-09-24. Not built. Question 9 promised it: "Written notes like 'influencer post
went live' come next, approved before a client sees them, the way Commentary works." The
team added three details on 2026-09-24: a note can go on any day; it shows in the chart's
hover box as well as in the callout, the way the old decks named the post or event after the
number; and the team picks which of that day's posts show with it, since the old decks
sometimes pictured two posts on one callout. Every file and line cited below was read on
`dev` at `df2cf05`.

**It copies Commentary's logic rather than inventing a new one:** the same permissions, the same
draft and approve lifecycle (an edit of an approved note leaves it showing until the new draft is
approved; a revoke falls back to the version before), the same race guards, and Commentary's own
guard functions imported as they are (`authorizeRowForClient`, `guardNotDeleted`, `canDeleteDraft`,
`lib/commentary/mutations.ts:29`, `:43`, `:56`). No Commentary file and no Commentary table
changes, because Renaissance runs Commentary. Two additions of our own, both in the new files
only: one open draft per day (P5), because a card shows one draft; and approve matching exactly
what the approver was shown (P5), so a client never sees words nobody approved.

### P1. What a note is

- A short line of plain text the team attaches to one day on one graph: client, platform,
  chart (`followers` or `engagements`) and day. That is the same key a hide uses
  (`chart_annotation_hides`, `lib/db/schema.ts:382-394`), so a hide on that chart and day
  covers the note too (P2.6).
- Any day inside the window the graph already annotates: the same `isoRange(dateRange)`
  start and end the peaks are picked from
  (`components/report-sections/organic-social/parts/follower-graph.tsx:61-62`,
  `parts/engagement-trend.tsx:48-49`, enforced in `pickPeaks`,
  `lib/organic-social/annotations.ts:36`). A note outside that window stays stored and shows
  when its own month is on screen.
- 1 to 80 characters after trimming, one line of plain text. It is rendered as text, never
  as HTML, so it needs no sanitizer (Commentary's HTML body does).
- Up to 2 of that day's posts, picked by the team (P3). Two is the most one callout pictures
  in the deck screenshots the team shared on 2026-09-24. None picked means the day's top post,
  as Phase 1 already shows.
  The picks are part of the note, so they go through the same draft and approval (P5): a
  client sees the picks of the approved version only.
- Per chart and day, at most one approved note shows and at most one draft is open (P5, P6).

### P2. Where a note shows

1. **On a top day**, it sits on its own line under that day's label, as in the approved sketch:
   `8/10 | +12 Followers`, then `Influencer post went live` (made-up example). `annotationLabel`
   (`annotations.ts:71-77`) does not change, and the label keeps its own element
   (`components/report-sections/organic-social/annotation-callouts.tsx:90`); the note is a second
   line under it. (Changed 2026-09-24 from a second pipe on the same line, to match the sketch.)
   Posts the team picked replace the automatic top post on that card, which also gives the
   team a way around the known case of another account's tagged post being the day's top
   post (Edge cases, below).
2. **On any other day**, it gets its own card in the same row, in date order: the date, the
   note, and the posts the team picked, or when none is picked the day's top post from
   `topPostByDate` (`annotations.ts:85-96`) if a post went live, for example `8/14` with
   `Influencer post went live` under it. It shows no number,
   because that day can be a zero or a loss: `annotationLabel` always writes a plus on
   followers (`annotations.ts:75`) and a peak's value is documented as always positive
   (`:9`), so reusing it would print `+-3 Followers`. The hover box gives that day's number.
3. **A dot** marks a note day once the note is approved and the day is not hidden, the rule
   the dots already follow (`trends.tsx:134` draws a dot only for a shown, unhidden
   callout). A day with no point on the series gets no dot: the chart already skips a mark
   whose day is not in the data (`components/charts/line-chart.tsx:135-136`).
4. **In the hover box.** Hovering a day with a dot shows its approved note under the value.
   The hover box is the Recharts `Tooltip` in the shared `line-chart.tsx:110-119`. It gains
   one optional prop, the notes keyed by x value. With no prop it renders exactly the
   `Tooltip` it renders today. Only `ChannelTrendChart` passes it, and only for approved
   notes on shown days. Drafts never reach the hover box, so it reads the same for the team
   and the client. It is the same kind of change this branch already made there: the
   optional `marks` prop, added in `922a090` and trimmed in `0bfa2d6`.
5. **The Annotations button** (`components/report-sections/organic-social/trends.tsx:43`,
   `:106-123`) shows and hides notes, their dots and their hover lines with the callouts, on
   the viewer's screen only. It appears only when a chart has something to show
   (`trends.tsx:71`), and note days count, so a chart with notes and no peaks still gets
   it. When every channel is toggled off, notes go with the callouts (`trends.tsx:73-74`).
6. **Hides win.** A hide is per chart and day, and clients never receive a hidden day
   (`lib/organic-social/annotation-hides/apply.ts:11-12`). So hiding a day removes its
   callout and its note from the client, peak or not. A note-only card carries the same
   Hide toggle every card has (`annotation-callouts.tsx:92-101`). The team sees a hidden
   card faded, note included.
7. **Printing** (Export PDF is `window.print()`): approved notes print. A draft line carries
   `no-print`, the way a hidden callout does (`annotation-callouts.tsx:84-88`). A card whose
   only note is a draft, on a day that is not a peak, has nothing for a client, so the
   whole card carries `no-print`; a row with nothing printable carries it too, extending
   the rule at `annotation-callouts.tsx:114-118`. On a wide screen the pinned cards are the
   printed callouts: the team's buttons, and its hidden and draft cards with their lines, never
   print (P2.8).
8. **Option B: pinned to their dots, like the deck** (approved 2026-09-24, the sketch). On a wide
   screen every callout a client may see (a top day, or a day with an approved note, not hidden)
   is a card in a band above the plot, joined by a red line down to its dot. The card shows the
   post picture(s), the date and number on the first line, and the note on its own line under it,
   cut at two lines; the full note is in the hover box. Cards that would overlap stack into rows;
   the first and last days stay inside the chart. The positions come from the chart's own plot
   area: Recharts places day `i` of `n` at `plot.x + i / (n - 1) * plot.width`, which was proven on
   2026-09-24 against Recharts' own dots at a fixed size.
   **The team's view** is the same chart with the team's buttons on each card: Hide from client or
   Unhide, Add or Edit note, Approve, Revoke, Delete draft. Its hidden and draft cards are pinned
   too, faded, never printed and with no dot; team cards are taller to fit the buttons, so the
   team's cards can stack a little differently from the client's. The Add note and Edit form opens
   above the chart.
   A callout whose day has no point on the series has no dot to join, so it goes in the row above
   the chart. On a phone-width screen (under 640px) the row above the chart is used, exactly as
   Phase 1 shows it today, with the same buttons. The shared `LineChart` gains optional `pins` and
   `pinHeight` props for this; absent, it draws exactly what it draws today (P11).

**Changed 2026-09-24, after my first look on our own local app (Phase 2b, approved mockup):** on every
screen size the graph shows only dots; hovering (or tapping, or focusing) a dot shows that day's card,
joined by a short red line, one at a time; no pinned band and no row, except a callout whose day has no
point on the series. The team's hidden and draft days get a faint dot only the team receives. Cards
never print: an exported PDF shows the dots. The Add note panel shows the month's posts as pictures
with their dates, days with posts only; a card's own Edit covers a top day with no post. Everything
else in P2 and P3 stands (approvals, hides win, posts from that day only, client redaction on the
server). Binding detail: the plan's Phase 2b, D1 to D10.

**Changed 2026-09-24 night, after my click-through of every client (Phase 2c):** each callout's dot
position comes from Recharts' own scale (on a follower graph the hit areas had sat off their dots); a
save shows one line saying what happened; the Add annotation panel loads a day's existing note, since
each chart holds one note per day. Smaller changes the same night: draft-only cards dim less (80%), the
button reads "Add annotation", the picker uses the site's dark scrollbar. After my audit (2026-09-25):
a card shows the note and the draft whole, and text the panel filled in stays with its day. Binding
detail: the plan's Phase 2c, D17 to D19.

### P3. Adding and changing a note

- **Add.** A team viewer who can edit (P4) gets an **Add note** button beside the
  Annotations button, on v2 platform graphs only. Clients never receive it. It opens a small
  form:
  1. **The day**, from the graph's window (P1), each listed with how many posts went live
     that day, so the days with posts stand out.
  2. **That day's posts**, as thumbnails, to pick up to 2. They come from `graphPosts`
     (`lib/organic-social/graph-posts.ts:13-14`), the fetch the callout thumbnails already
     use: Dash's Top Content for that platform and window (`fetchTopContentFrozen`, capped
     at 500 posts, `lib/organic-social/top-content.ts:19`). A post outside that feed, such as
     an influencer's post on their own account that does not tag the client, cannot be
     picked; the note names it instead ("What the team does today", above).
  3. **The text.**
- **On each card** (pinned on a wide screen, in the row on a phone), the same viewer gets Hide
  from client or Unhide, Add note or Edit, and Delete on a draft; an approver also gets Approve on
  a draft and Revoke on an approved note. Edit opens the form above the chart.
- **Every control carries `no-print`**, like the Hide toggle (`annotation-callouts.tsx:97`).
- **After each action** the page refreshes the way the Commentary panel does:
  `router.refresh()` once the action returns, after the action's `revalidateTag` has busted
  the cache (`components/report-sections/commentary/commentary-panel.tsx:66-68`). The new
  notes arrive through the chart's `annotations` prop, which the chart re-reads on every
  render (`trends.tsx:72`).

### P4. Who can do what: Commentary's rules, reused

- **Team or client** is decided by role, as monthly Commentary does
  (`components/report-sections/commentary/monthly.tsx:19-22`, `viewerForRole`,
  `lib/organic-social/reporting-months.ts:69-71`). Its team roles are the same two that
  `isInternalStaff` allows for hides (`reporting-months.ts:35`,
  `lib/dashboard/permissions.ts:8`).
- **Write, edit, and delete a draft:** a team viewer whose email passes
  `canEditCommentary`, any `@avenuez.com` address (`lib/commentary/permissions.ts:18-20`).
- **Approve and revoke:** `canApproveCommentary`, the same check given a different list: the
  notes' own `CHART_NOTES_APPROVERS` env var (decided 2026-09-24, because the organic social
  approvers differ from Commentary's). The parser is Commentary's (`permissions.ts:23-29`),
  passed the notes' value; Commentary's own `COMMENTARY_APPROVERS` stays untouched and grants
  nothing here. Unset means nobody can approve a note. Whose emails go on the new list is the
  open question (P13).
- **Anyone who cannot edit gets the client view:** approved notes only, with no author,
  time, status or id, as monthly Commentary redacts for a non-editor (`monthly.tsx:40`,
  `toClientSafeEntry`, `lib/commentary/select.ts:46-61`). The reason in that comment holds
  here: a field that crosses to the browser can be read whatever the JSX renders, so the
  redaction happens on the server.
- **Every server action checks the role and the email.** The hide action checks the role
  (`app/actions/organic-social.ts:49`); the Commentary actions check the email
  (`app/actions/commentary.ts:58`, `:125`, `:155`, `:191`). A note action does both, so a
  client role is refused whatever its email, the line monthly Commentary draws for reads
  (`monthly.tsx:12-15`). A hidden control is not an authorization boundary.
- **A note named by id must belong to the client in the call**, as `authorizeRowForClient`
  checks for Commentary (`lib/commentary/mutations.ts:29`).
- **No note can be written or read for a client that is not on locked months**
  (`hasReportingMonths`, `lib/organic-social/reporting-months.ts:75-79`): every action refuses it
  and the read skips it. The October clients are on locked months. Renaissance is not: its
  `dash_social_config` holds only `brandId` in dev, staging and prod (the 2026-09-17 Renaissance
  baselines, unchanged by every drift check since). So nothing in this feature can write a row for
  Renaissance or read one for it, whoever calls the code.
- **The viewer's email.** `OrganicSocialCtx` carries the role but not the email
  (`components/report-sections/organic-social/ctx.ts:3-14`). `OrganicSocialBody` already
  reads the session for the role (`index.tsx:51-53`); it adds the email as an optional
  field, default null. Only the notes read it.

### P5. Lifecycle: Commentary's, with one open draft per day

- **Save** with no open draft on that chart and day creates a draft; with one open, it
  edits that draft in place. Commentary creates a new draft whenever no row is named
  (`app/actions/commentary.ts:81`, `:99`), which allows several drafts per period. One line
  on one day needs only one, so notes cap it (P6).
- **Approve** makes it visible to clients. The note shown for a day is the most recently
  approved one, ranked by approval time then last update, as `mostRecentApprovedPerPeriod`
  ranks Commentary (`lib/commentary/select.ts:35-44`). Approve carries the text and posts the
  approver was shown, and only succeeds if the draft still holds exactly those; otherwise it says
  "This note changed since you opened the page". Editing a draft changes that same row, so without
  this an edit made after the approver opened the page would reach a client unread. Commentary
  approves by id alone (`app/actions/commentary.ts:122`, update at `:136-140`); this check lives
  only in the new notes code.
- **Edit an approved note** opens a draft, or edits the open one; the approved version stays
  visible to clients until the draft is approved, as `saveCommentary` does
  (`app/actions/commentary.ts:53-55`).
- **Revoke** returns an approved note to draft (`revokeCommentary`, `:150-152`). Clients then
  see the note approved before it, if there was one, because Commentary keeps superseded
  approvals so a revoke falls back (`select.ts:18-20`). To take a note down for good, revoke
  each approved version, or hide the day. If a draft is already open on that day, revoke is
  refused with a message to delete or approve that draft first, so a day never holds two
  drafts.
- **Delete** is for drafts only, and is a soft delete (`deleteCommentaryDraft`, `:188`), with
  Commentary's database check that a deleted row is a draft
  (`report_commentary_no_deleted_approved`, `lib/db/schema.ts:353`).
- **What the team sees** per chart and day: the approved note if there is one, and the open
  draft under it marked Draft (`visibleEntries` keeps drafts for editors,
  `lib/commentary/select.ts:21-30`).
- **Races:** save, approve and delete re-assert `deleted_at IS NULL`, and every write uses
  `.returning()`, so a lost race reports "not found" instead of a false success
  (`app/actions/commentary.ts:17-34`, which also explains why revoke skips the first check).
  Two people opening a draft on the same day at once: the second insert fails the unique
  index (P6), and the action returns "a draft is already open on this day" instead of
  throwing.
- **Freshness:** `revalidateTag('db', 'max')` after every write, as hides do
  (`app/actions/organic-social.ts:62`) and Commentary does (`commentary.ts:111`).

### P6. Storage

A new table, `chart_notes`, purely additive: no existing table, column or row changes.

| Column | Type | Note |
| --- | --- | --- |
| `id` | uuid | primary key |
| `client_id` | uuid | references `clients`, cascade on delete |
| `channel` | text | a `DashChannel` |
| `chart` | text | `followers` or `engagements` |
| `day` | date | the UTC day Dash counts, as hides store it |
| `body` | text | 1 to 80 characters, plain text |
| `post_ids` | bigint[] | up to 2 Dash post ids, the id `TopContentPost` carries (`lib/organic-social/content-types.ts:16`) and `post_designations.post_id` stores (`lib/db/schema.ts:367`); empty means none picked |
| `status` | `commentary_status` | reuses the enum, `draft` or `approved` (`lib/db/schema.ts:321`) |
| `created_by`, `updated_by` | text | emails |
| `approved_by` | text, nullable | email |
| `created_at`, `updated_at` | timestamptz | |
| `approved_at` | timestamptz, nullable | |
| `deleted_at`, `deleted_by` | timestamptz, text, nullable | soft delete |

- An index on (`client_id`, `channel`), the shape of the one read (P7).
- A check that a deleted row is a draft, as `report_commentary_no_deleted_approved`.
- A partial unique index on (`client_id`, `channel`, `chart`, `day`) where
  `status = 'draft'` and `deleted_at` is null: at most one open draft per day. The pinned
  drizzle-orm (0.45.2) declares an index condition with `.where()`
  (`node_modules/drizzle-orm/pg-core/indexes.d.ts:67`). Nothing in `schema.ts` uses one
  yet, so the plan checks the generated SQL.

Not `report_commentary`: its rows are HTML with a reporting period and a view key, a
different shape. Nothing Renaissance renders reads the new table.

Migration `0025` (the journal ends at `0024_yielding_outlaw_kid`,
`drizzle/meta/_journal.json`). Applied to staging with
`CACHE_DISABLE=1 npx tsx --env-file=.env.staging scripts/migrate-http.ts`
(`MIGRATIONS-PENDING.md:195`, `:254-256`) before the code reaches staging; applied to
production before the merge to `main`, only on my written go, and recorded in
`MIGRATIONS-PENDING.md`.

### P7. Loading and failure

- **One read per platform per render**, React-cached like `getAnnotationHides`
  (`lib/organic-social/annotation-hides/select.ts:12`), shared by the tab's two graphs.
- **Order:** notes first, then the day list (the peaks plus note days in the window), then
  `withHides` over that list. `withHides` skips its read when the list is empty
  (`components/report-sections/organic-social/parts/annotation-hides.ts:17`); that stays
  right, because a note day is in the list before it runs.
- **Picked posts are drawn from the posts already loaded.** Each id is looked up among that
  day's posts from `graphPosts`; one that is no longer there is skipped, and a card whose
  picks are all gone falls back to the day's top post. Every picked post is trimmed to its
  thumbnail on the server the way `toChartAnnotations` trims the top post today
  (`annotations.ts:118-125`), so no caption, metrics or id reaches a client's page. Only the
  Add note and Edit forms, which clients never receive, carry the candidates' ids.
- **Fails closed, as hides do for clients** (`parts/annotation-hides.ts:29-36`): if the
  notes cannot be read, nobody sees a note, team included, the team gets no note controls, the error is logged, and the
  graphs render exactly as Phase 1 does.
- **Only in the v2 parts on platform tabs:** `FollowerSectionV2`
  (`parts/follower-graph.tsx:54-74`) and `TrendSectionV2` (`parts/engagement-trend.tsx:38-61`).
  On Overview both return before any annotation is built (`follower-graph.tsx:55`,
  `engagement-trend.tsx:39-42`), so Overview gets no notes.

### P8. Locked months

Notes are the team's words, not Dash numbers, so they never lock, like hides (section 8)
and Commentary. The team can add a note to August after August locks.

### P9. Validation

Pure and unit tested, like `authorizeAnnotationHide`
(`lib/organic-social/annotation-hides/mutations.ts:16-24`). The three checks it makes today
(`:19-21`): a known platform, a known chart, a real calendar day (`isRealDay`, `:8-12`). New
for notes: the day is not after today in UTC, and the body is 1 to 80 characters after
trimming, with no control characters (so no line breaks), and at most 2 post ids, each a
positive integer, no repeats. Whether each id is a post of that day is checked at render,
where the posts are already loaded (P7), so the action makes no Dash call. The client must
exist, and a note named by id must belong to it. Anything else is refused before any write.

### P10. Edge cases

| Case | Behaviour |
|---|---|
| A note on a top day | Its own line under the callout's date and number. |
| A note on another day | Its own card: date, note, and a thumbnail if a post went live. No number. |
| That day lost followers, or had none | The card shows as usual, with no number, so never `+-3`. The hover box gives the value. |
| The day has no point on the series | Card only: no dot, no hover line. |
| The team picked posts | They replace the automatic top post on that card. |
| A picked post is no longer in Dash's answer | Skipped; if none remain, the day's top post shows. |
| No post went live that day | No thumbnail; the note alone. |
| An influencer's post on their own account | Cannot be picked (not in the feed); the note names it. |
| The day is outside the window on screen | Not shown; it shows with its own month. |
| A draft only | The team sees it marked Draft, with no dot and no hover line, never printed. Clients get nothing. |
| An approved note is edited | Clients keep the approved text until the new draft is approved. |
| An approved note is revoked | Clients see the version approved before it, or nothing if there was none. |
| Revoke while a draft is open on that day | Refused: delete or approve the draft first. |
| Two people start a draft on the same day | The second is refused by the index and told a draft is open. |
| The day is hidden | Clients get neither callout nor note; the team sees both, faded. |
| A note added on a day the team had already hidden | The client never receives it. The team sees it unfaded, with its dot, until the next navigation: the chart seeds hidden days once (`trends.tsx:44-49`), the open "per-view state" item in CLAUDE.md. The plan closes that item or accepts it. |
| Every channel toggled off, or the Annotations button off | Notes, dots and hover lines go with the callouts. |
| Neighbouring top days, or notes a day apart | Their pinned cards stack into rows above the plot instead of overlapping. |
| A callout on the first or last day of the month | Its pinned card stays inside the chart; the line still ends on the dot. |
| Many callouts in one month | The band above the plot grows a row at a time; nothing is dropped. |
| A phone-width screen | The row above the chart, as Phase 1 today. A phone renders wide first and switches once it loads. |
| The notes cannot be read | Nobody sees a note; logged; the graphs are exactly Phase 1. |
| A client role, or a team role without an `@avenuez.com` email, calls an action directly | Refused by the action. |
| A client not on locked months (Renaissance) | Every action refuses it before any read or write, and its graphs never read notes. |
| A draft edited after the approver opened the page | Approve is refused with "This note changed since you opened the page"; reload and approve what is there. |
| Malformed input (unknown platform or chart, bad or future day, empty or long body) | Refused by the validator before any write. |
| Overview | No notes. |
| A locked month | Notes can still be added and changed; they never lock. |

### P11. Renaissance

- **Nothing can be written or read for it.** Every note action refuses a client that is not on
  locked months, and the read skips one (P4). Renaissance is not on locked months.
- **Nothing it runs changes behaviour.** No Commentary file or table is edited. The migration
  creates one new table and changes nothing else (P6).
- **Its graphs are v1** (section "Renaissance" below) and render no annotations, so they
  render no notes. The notes read runs only in the v2 parts (P7).
- **Every shared change is optional and does nothing by default:**
  - the two new `LineChart` props, `notes` and `pins`: absent means today's `Tooltip`, no band,
    no card and no connector. Its three callers are `trends.tsx`,
    `components/report-sections/paid-media/overview/trend.tsx` and
    `components/report-sections/organic-social/parts/ytd-review.tsx`; only `trends.tsx` passes
    them, and only for callouts a client may see (P2.4, P2.8);
  - the optional email on the context (P4);
  - the new optional fields on `ChartAnnotation` (`lib/organic-social/annotations.ts:108`).
    A chart given no annotations already renders exactly as before (`trends.tsx:28-30`).
- **Proven by the snapshots that already exist, unchanged:**
  `components/report-sections/organic-social/v1-render.golden.test.tsx` (v1 charts, and the
  Paid Media shaped `LineChart` at `:79-81`), `render-invariant.test.tsx`,
  `parts/composition.golden.test.tsx`, `parts/follower-graph.golden.test.tsx` and
  `parts/engagement-trend.golden.test.tsx`.
- **Checked at every build step, not only at the end:** those snapshots are run and must be
  byte-identical before every commit; a test pins that v1 never reads notes; a test pins that every
  action refuses a Renaissance-shaped client; and on staging, after every step, a read-only check
  that no `chart_notes` row exists for Renaissance, its `clients` row is unchanged, its config still
  has no `reportingMonths`, and the drift check's `REN.*` lines are identical.

### P12. Testing

- Renaissance first: every snapshot in P11 passes unchanged before and after.
- The validator: each refusal, and a good payload.
- Permissions: write and delete for editors only, approve and revoke for approvers only,
  client roles refused by every action whatever the email, and a note id from another
  client refused.
- The lifecycle: draft, approve, edit opens a draft while the approved version stays
  visible, a second save edits the open draft, revoke falls back to the earlier approved
  version, revoke refused while a draft is open, delete of a draft only, a lost race
  reported as "not found", a second concurrent draft refused, and an approve
  refused when the draft changed after the approver opened the page.
- What each audience receives: non-editors get approved notes only, redacted, with nothing
  else in the props; the team gets drafts marked; a hide removes the day's note for
  clients.
- Where a note shows: joined to a top-day card, its own card on another day with no number
  (including a negative and a zero day), the dot only when approved and the day is in the
  data, the hover box with approved notes only; the Annotations button hides them; drafts
  and controls carry `no-print`, and a draft-only row prints nothing.
- Picking posts: up to 2, a pick replaces the top post, a vanished pick is skipped and all
  vanished falls back to the top post, and a client's page carries thumbnails only.
- `LineChart` with no notes and no pins renders exactly as today; with notes, the hover box
  shows the day's note; with pins, each connector ends exactly on Recharts' own dot, cards stay
  inside the plot and stack instead of overlapping.
- The layout by screen: on a wide screen every callout pinned, with the team's buttons on each
  card and the team's hidden and draft cards pinned faded; no row for a client; the row above the
  chart on a phone; a callout with no point on the series in the row.
- A read failure: no notes and no note controls for anyone, logged, graphs unchanged.
- The migration: applied to staging, then a read-only check that the table, its check and
  its partial unique index exist as in P6, and that no other table changed.
- The database, read back on staging after each step: a save stores a draft row, a reload still
  shows it, approve marks it approved, an edit of an approved note adds a draft beside it while the
  approved row stays, revoke returns it to draft, delete sets `deleted_at` on a draft only, and no
  row ever exists for Renaissance.

### P13. Who approves (decided 2026-09-24)

The organic social lead approves notes; I named her on 2026-09-24, and her email goes only into
`CHART_NOTES_APPROVERS` in each environment, never into this public repo.

Why a separate list: notes do NOT reuse Commentary's `COMMENTARY_APPROVERS`, because the organic
social approvers differ from Commentary's. The new var is read by the new permissions module only,
through Commentary's unchanged parser, and unset means nobody can approve a note. Setting it is an
environment change in Vercel (staging first, production later), no code change, plus the mirrored
local `.env` copy.

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
  when absent. `line-chart.tsx` keeps the optional `marks` prop this branch added before
  this spec (`922a090`); the rebuild only dropped the mark's unused `label` (`0bfa2d6`).
  (Corrected 2026-09-24: this line first said `line-chart.tsx` is not edited.) Paid Media,
  which Renaissance also has, passes no marks. Phase 2 adds one more optional prop (P11).
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
| Annotate peaks, not every post | Me, from the APFM June deck | 2026-09-18 | Approved by Jasmine 2026-09-21 (Q9), pending a demo |
| 2 follower and 3 engagement annotations | Me, from the deck | 2026-09-18 | Approved by Jasmine 2026-09-21 (Q9), pending a demo |
| v2 follower graph plots daily net new followers | Me, from the deck | 2026-09-18 | Approved by Jasmine 2026-09-21 (Q9), pending a demo |
| v2 graphs use the UTC month | Me, after the probe | 2026-09-18 | Decided |
| Titles and the Annotations button follow the outlines word for word | Jasmine's outlines | 2026-09-18 | Decided |
| A row of annotations above the chart, one thumbnail each, shown by default | Me, from the deck | 2026-09-18 | Approved by Jasmine 2026-09-21 (Q9), pending a demo |
| The team can hide one annotation from the client; internal staff only; the team sees it faded | Me | 2026-09-17 and 2026-09-18 | Approved by Jasmine 2026-09-21 (Q9), pending a demo |
| A hide attaches to the annotation's day on one chart, not to a post | Me | 2026-09-18 | Decided |
| Hides stored in a new additive table | Me | 2026-09-17 | Decided |
| Sponsored posts can be thumbnails | Default | 2026-09-18 | Open: her Q8 answer (2026-09-21) is about Top Content, so I decide this at the rebuild |
| No annotations on Overview | Me | 2026-09-18 | Decided |
| Written notes wait for Phase 2 | Me | 2026-09-18 | Done: Phase 2 specified 2026-09-24 |
| A note attaches to one day on one graph, the same key as a hide | Me, from the old decks and the team's request | 2026-09-24 | Decided |
| A note on a top day joins its callout; any other day gets its own card, with the date and the note but no number | Me, from the old decks and `annotations.ts:9`, `:75` | 2026-09-24 | Decided |
| A note day gets a dot and a hover line only once approved and not hidden | Me | 2026-09-24 | Decided |
| A note also shows in the chart's hover box | The team's request | 2026-09-24 | Decided |
| Notes use Commentary's approval flow and permissions | Jasmine's question 9 | 2026-09-21 | Decided |
| Note actions check the role as well as the email | Me, from `monthly.tsx:12-15` | 2026-09-24 | Decided |
| Notes copy Commentary's logic and import its guard functions; no Commentary file or table changes | Me: keep Commentary's logic rather than write a new one | 2026-09-24 | Decided |
| Approve only what the approver was shown (one of our two additions to Commentary's logic) | Me, from the adversarial review of the plan | 2026-09-24 | Decided: approved 2026-09-24 |
| Notes only for clients on locked months, so none can be written or read for Renaissance | Me | 2026-09-24 | Decided |
| One open draft per chart and day; revoke refused while one is open | Me | 2026-09-24 | Decided |
| Notes are plain text, 1 to 80 characters | Me | 2026-09-24 | Decided |
| The team picks up to 2 of that day's posts; none picked means the top post | The team's request; 2 from the deck screenshots | 2026-09-24 | Decided |
| Notes never lock | Me | 2026-09-24 | Decided |
| The reading of Phase 2: any day, the team picks that day's posts, a short note, on the callout and on hover, approved first | Confirmed with the team (Kyleah) | 2026-09-24 | Confirmed |
| Callouts pinned to their dots like the deck, for top days and notes, always visible, printed as shown; phones keep the row | Me, from the deck | 2026-09-24 | Decided |
| A note needs text even when posts are picked | Me | 2026-09-24 | Decided |
| The team's buttons sit on each card (pinned or in the row); hidden and draft cards are pinned faded for the team only, never printed | Approved by the organic social team | 2026-09-24 | Decided |
| The note sits on its own line under the date and number, and the connecting line is red, as in the approved sketch | The approved sketch | 2026-09-24 | Decided |
| Notes get their own approver list, `CHART_NOTES_APPROVERS`, separate from Commentary's; unset approves nothing | Me | 2026-09-24 | Decided |
| Who approves notes for Organic Social: the organic social lead, set in `CHART_NOTES_APPROVERS` (the email lives only in the environment, never in this public repo) | Me | 2026-09-24 | Decided |
| Hover cards instead of pinned ones (dots only; hover, tap or focus shows the card); Add note picks posts by picture, days with posts only; editing stays team only; PDF shows dots | Me, after the first local look | 2026-09-24 | Decided (Phase 2b) |
| Dots placed by Recharts' own scale; one line after each save; a day's existing note loads in the Add annotation panel; draft cards at 80%; the button reads "Add annotation" | Me, after my local click-through | 2026-09-24 | Decided (Phase 2c) |
| Red dots on zero-engagement days deferred | Me | 2026-09-18 | Decided |

