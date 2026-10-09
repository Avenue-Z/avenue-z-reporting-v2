# Organic Social: Jasmine's 10/9 feedback (design)

**Status:** spec, for review. No code yet.
**Branch:** `feat/os-1009-feedback`, cut from `origin/dev` at `e659cfb1`, whose code is identical to `origin/staging`
(`3b88e432`, `git rev-list --count origin/staging..origin/dev` = 0). Every citation below is to that code.
**Sources:** the 10/9 call with Jasmine and Paul (transcript, private), Jasmine's notes on the 10/8 QA table (rows 5 to 7),
her Dash screenshot of 2026-10-09 12:50 PM, and read-only probes run 2026-10-09 (outputs kept privately, named below).

## 1. What changes, in one paragraph

Four changes, all on Organic Social. (1) The Influencer tab moves from under Instagram to directly under Overview.
(2) The Influencer tab loses its Recommendations box and keeps Insights. (3) On the Influencer tab, a post Dash gives no
`views` for shows Dash's `public_views` instead, so co-authored posts count in Views and in Total Views. (4) A client on
the older Top Content (top-content@2, today only Renaissance) with its Instagram handle saved splits Instagram posts by
author, the rule A Place For Mom already uses: a post authored by another account (co-authored) or tagging the client
(UGC) is Influencer; a post the client authored is Organic. Nothing else changes. No locking or freezing work is added for
Renaissance: that is unapproved (call 03:17 and 19:17, Paul to confirm with Nick).

## 2. Where each request comes from

| # | Request | Source |
|---|---|---|
| 1 | "Can we please move this tab under the Overview Tab?" | QA row 5 note; call 09:11 ("move it under the overview tab") |
| 2 | "We don't need recommendations for this tab." | QA row 6 note; call 15:53 ("we don't do their influencer marketing") |
| 3 | "The total number of views is calculated incorrectly." | QA row 5 note; call 12:51 to 14:28 (Good News Movement post, ~742K views) |
| 4 | Co-authored posts are Influencer, primary-authored are ours; apply it to Renaissance | The rule: call 11:19 to 12:15 (Jasmine, 12:06: "if we're co-authored ... that would be like an influencer post. But if we're primary author ... that's our post"); Dash screenshot 12:50 PM. Renaissance: my decision, 2026-10-09, after the call. The transcript does not ask for Renaissance in so many words (12:29 is a request for an example screenshot), and Paul noted Renaissance changes are under contract scrutiny (03:39), so this is a deliberate Renaissance change, not a reading of the call |

Out of scope, with the reason: "posts that are not influencer posts" (QA row 5) are 4 stored designations, a data step
(section 8); "Renaissance IG section still includes the influencer posts" (row 7) was withdrawn on the call (17:38,
"it's clear now, so you can ignore"); "add views to each card" (14:51) was withdrawn (15:27, "You don't have to"), and
cards already show Views when a post has any (`components/report-sections/organic-social/influencer-card.tsx:5-13`,
`post-card.tsx:21`); Renaissance LinkedIn shares (07:34) and Renaissance locking (03:17) are Paul's.

## 3. Change 1: the Influencer tab directly under Overview

**Today.** The tab list is one array, `ORGANIC_SOCIAL_SUBSECTIONS` (`lib/constants.ts:203-217`), in the order Overview,
Instagram, Influencer, Facebook, LinkedIn, X, TikTok. `organicSocialSubsections` (`lib/constants.ts:227-238`) filters it
per client (allowlisted channels, `hiddenReports`, `hasInfluencerTab`) and, when the client hides Overview, drops it
(`:235-237`). The landing tab is `resolveOrganicSubsection(client, null)`: the Overview entry when present, else the
first entry (`lib/constants.ts:241-244`). Every reader takes the order from these two functions: the staff sidebar
(`components/layout/sidebar.tsx:625, 643`), the portal sidebar (`components/layout/portal-sidebar.tsx:276, 292`), the SPA
and deep-link report routes (`app/dashboard/[clientSlug]/reports/page.tsx:171`,
`app/portal/[clientSlug]/reports/page.tsx:215`, `.../reports/[reportSlug]/page.tsx:105` and `:126`), the PDF export
(`lib/export/organic-social-view.ts:9`), the lock sweep (`lib/organic-social/lock-sweep.ts:20`) and KPI Check-In
(`parts/kpi-check-in.tsx:52`, channels only, so order-free).

**New.** The array order becomes Overview, Influencer, Instagram, Facebook, LinkedIn, X, TikTok.

**Kept: a client that hides Overview still opens on Instagram.** Today's test pins it
(`lib/organic-social/influencer-tab-list.test.ts:33-35`: Overview hidden gives Instagram, Influencer, Facebook). With
the new array that client would get Influencer first, and since Influencer has no channel the landing tab would be the
Influencer tab. So `organicSocialSubsections`, when it removes Overview, places the Influencer entry directly after
Instagram (today's position). No client is in that case today: the two clients with the tab, A Place For Mom and
Renaissance, both show Overview (staging probe `2026-10-08-staging-after-post.out`: A Place For Mom `hidden_reports`
has no `organic-overview`; Renaissance's is empty). The "keep Overview when no platform tab is left" branch
(`:235-237`) is unchanged.

**Effects to accept.** The lock sweep visits tabs in list order (`lock-sweep.ts:20`); only the order of its requests
changes, not which tabs it visits. The PDF export resolves the tab by id (`organic-social-view.ts:9`), not by position.

## 4. Change 2: no Recommendations box on the Influencer tab

**Today.** Every Organic Social view renders the shared parts at the top and the bottom, keyed by the view's commentary
key (`components/report-sections/organic-social/index.tsx:36, 45, 50`). The bottom part is Recommendations, which renders
under `recommendationsViewKeyFor(viewKey)` and renders nothing when that is null
(`components/report-sections/shared/parts/registry.tsx:25-37`). `recommendationsViewKeyFor` returns
`${key}:recommendations` for every Organic Social key except a Recommendations key (`lib/commentary/views.ts:37-41`), so
the Influencer tab gets `organic-social:influencer:recommendations`, a member of the `CommentaryViewKey` union
(`views.ts:27`) and of `COMMENTARY_VIEWS` (`views.ts:112`). `isCommentaryViewKey` (`views.ts:117-119`) is the write path's
guard, so a save under that key is accepted today.

**New.** `recommendationsViewKeyFor('organic-social:influencer')` returns null, so the bottom part renders nothing on the
Influencer tab, live and in the PDF (the export renders the same report, `app/export/[clientSlug]/organic-social/page.tsx`).
The key is removed from the union and from `COMMENTARY_VIEWS`, so `isCommentaryViewKey` refuses a save under it. Insights
on the Influencer tab (`organic-social:influencer`, `views.ts:111`) is unchanged.

**Measured.** No stored rows exist under `organic-social:influencer%` on staging (probe
`2026-10-09-influencer-recs-readonly.out`: "no rows"), so nothing is stranded. Production: inferred, not probed. The tab's
code is not on `origin/main` (`git show origin/main:lib/organic-social/influencer-tab.ts` fails), so no production page
offers the box; the plan's Renaissance proof probes it read-only before launch.

## 5. Change 3: Influencer tab Views use `public_views` when `views` is empty

**Today.** A card's Views and the sort by Views read `metrics.impressions`; for Instagram that is Dash's post field
`views` (`lib/organic-social/content-types.ts:107`, read at `lib/organic-social/top-content.ts:128`). Total Views is the
sum of `metrics.impressions` over the tab's posts, shown as "—" with "Not reported for these posts" when the sum is 0
(`lib/organic-social/influencer-totals.ts:7-10`; `parts/influencer-posts.tsx:52`). A card hides its Views row when
`impressions` is 0 (`influencer-card.tsx:5-13`).

**Measured (probes `2026-10-09-influencer-tab-render-readonly.out`, `2026-10-09-public-views-and-designations-readonly.out`).**
A Place For Mom's September Influencer tab (13 posts) shows Total Views 6,107: the 4 of its own posts stored as
Influencer (2,109 + 2,051 + 914 + 1,033). The other 9 count 0. For a post authored by another account Dash leaves
`views` absent and fills `public_views` (Good News Movement: `public_views` 704,013 in the 2026-10-05 lock, 729,689 live on
2026-10-09; Jasmine saw ~742K on the post). For a UGC post Dash returns `views: 0` and sometimes `public_views` (27,461 and
17,400 in the lock). Two co-authored posts carry neither.

**New.**
- `normalizePost` adds an optional `publicViews` to an **Instagram** post (owned and UGC feeds alike; both go through
  `normalizePost(p, 'INSTAGRAM')`, `top-content.ts:169, 194`) when Dash's `instagram.public_views` is a finite number ≥ 0;
  otherwise the field is absent. `TopContentPost` gains `publicViews?: number` (`content-types.ts:15-29`). Only the
  Influencer tab reads it, but it travels further: `toPayload` spreads every field (`snapshot.ts:8-11`), so every
  Instagram window frozen after deploy stores it in `top_content_snapshots` (Renaissance's production rows included), and
  every gallery passes it to its client component as a prop. No visible change there; the Renaissance proof covers the
  stored payload shape and the drift checker.
- On the Influencer tab only (`parts/influencer-posts.tsx`), after the split and before the totals and the grid, a post
  whose `metrics.impressions` is 0 and which has `publicViews` takes `publicViews` as `metrics.impressions`. Cards,
  the sort by Views, and Total Views then include it.
- The card's Engagement Rate is untouched: on the outline path it is computed before the split
  (`withViewsBasisRate`, `outline-top-content.ts:37-40`, applied at `parts/influencer-posts.tsx:39`), so a post with no
  `views` keeps a null rate and its row stays hidden.
- Not changed on screen: the Instagram tab, Overview, every other channel, every other client surface.
- **Two measures in one total.** Total Views then adds Dash `views` (the client's own posts) and `public_views` (others'
  posts). On own posts the two are close but not equal (2,051 against 2,044, probe above); the total is a sum of each
  post's best available view count, and is stated that way in the staging note.
- **What Jasmine will see.** September is locked, so Good News Movement shows 704,013, below the ~742K she saw on the post
  today and the "1100 something thousand" she mentioned at 14:16. Whether `public_views` is exactly the count Instagram
  shows a co-author is unverified; the staging note says the number is Dash's, as of the 2026-10-05 lock.

**Locked and frozen months.** A locked month stores Dash's raw answer and normalizes it at read (`frozen.ts:68-69`:
a locked client skips the freeze table and reads through the locking client), so A Place For Mom's September gains
`publicViews` with no recapture and shows the 2026-10-05 value (704,013 for Good News Movement). A window already in
`top_content_snapshots` stores normalized posts (`lib/organic-social/snapshot.ts:8-11`), captured without `publicViews`,
so it keeps today's Views. For Renaissance that is September, August and July in production (probe
`prod-2026-10-09-ren-frozen-and-handles-readonly.out`). Accepted: no freezing work for Renaissance.

## 6. Change 4: the author rule for a top-content@2 client with a saved Instagram handle

**Today.**
- top-content@3 (the five locked-month clients' platform tabs) fetches with authors and UGC marks and splits with
  `partitionByAuthor`: stored designation, then UGC is Influencer, then author ≠ the client's handle is Influencer and
  author = handle is Organic, otherwise the #ad rule (`parts/top-content-outline.tsx:22-24, 40-43`;
  `lib/organic-social/outline-top-content.ts:20-33`). The handle is `dash_social_config.ownHandles.instagram`
  (`outline-top-content.ts:12-18`); `ownHandlesFor` drops it, with a logged warning, when no post has an author or no
  author matches it (`:47-84`).
- top-content@2 (Renaissance's platform tabs and Overview, probe `prod-2026-10-09-ownhandles-and-pins-readonly.out`)
  fetches without authors or UGC marks and splits with `partitionPosts`: stored designation, then #ad
  (`parts/top-content.tsx:71-77`; `designations/partition.ts:6-8, 13`). A UGC post without #ad therefore lands in
  Renaissance's owned Top Content today.
- The Influencer tab follows the platform pin: `influencerRulesFor` returns 'outline' for @3, else 'designations'
  (`lib/organic-social/influencer-tab.ts:31-36`), and `InfluencerPostsSection` makes the Instagram tab's exact request
  and split (`parts/influencer-posts.tsx:23-40`) so a post is never Influencer on one tab and Organic on the other.

**Measured.** Jasmine's "Co-Authored Collab" filter for A Place For Mom shows exactly the posts whose author is not
`aplaceformom`, same engagement counts (probe `2026-10-09-coauthored-vs-dash-filter-readonly.out`: 7 co-authored, all 6
in her screenshot present). Dash's CONTENT record has no primary/co-author field; the distinction is
`instagram_user.handle` against `instagram.collaborators` (probe `2026-10-09-influencer-views-and-author-readonly.out`,
key listing). Renaissance's own handle in Dash is `renbenefits` (19 of 22 September posts; 3 by other accounts).
Renaissance has no `ownHandles` in staging or production. On staging, A Place For Mom, Akara, Joy of Life and Piper have
a handle, all on top-content@3 for their platform tabs; their Overviews resolve to top-content@2 but are hidden (A Place
For Mom's Overview has no Top Content part).

**New.**
- **The switch.** A top-content@2 split uses the author rule when the client has a saved Instagram handle
  (`parseOwnHandles(dsc).INSTAGRAM`). No handle: today's behaviour exactly. This is the per-client key; no slug is named in
  code. Effect on today's clients: Renaissance, once its handle is saved; the four staging clients with a handle only on
  their Overviews, which have no Top Content part (A Place For Mom: Overview resolves to `kpi-check-in@1`) or are hidden
  and cannot be opened (Akara, Joy of Life, Piper; `organicSocialSubsections` drops a hidden Overview,
  `constants.ts:235-237`, and the routes resolve to a listed tab, `:241-244`).
- **top-content@2 with the switch on** (`parts/top-content.tsx`): fetch through `fetchTopContentFrozen` with
  `fetchLive` asking `fetchTopContent` for `{ withAuthor: true, markUgc: true }` (the same injection @3 uses), then
  `own = ownHandlesFor(posts, dsc, slug, channel)` and `partitionByAuthor(posts, stored, own)`. No `withViewsBasisRate`
  (@2's card rates stay as today), no owned limit, same heading, same sort keys, same gallery. Overview (channel null)
  uses the same rule; `authorOf` is Instagram-only (`post-author.ts:7-13`), so other channels fall to the #ad rule as today.
  The client row is read once, before the fetch, and reused for the influencer-tab check that today reads it after the
  split (`parts/top-content.tsx:80`), so the number of reads does not grow.
- **The Influencer tab.** `influencerRulesFor` gains a third input (the client's `dash_social_config`) and a third result,
  'author', for a top-content@2 pin with the switch on. A @1 pin or no pin stays 'designations' (the Instagram tab does
  no split there, `parts/top-content.tsx:22-25`). The
  tab then makes the same request as the Instagram tab (authors and UGC marks) and splits with `partitionByAuthor` and
  `ownHandlesFor(..., 'influencer')`, without `withViewsBasisRate`. 'outline' and 'designations' are unchanged.
- **Data, not code.** Renaissance's handle `renbenefits` is saved to `dash_social_config.ownHandles.instagram` on staging by
  a host-guarded script, on Thomas's go; production at launch only with his written consent.

**What Renaissance sees after the handle is saved.** Freezing is per window and per key: the Instagram tab freezes under
`INSTAGRAM`, Overview under `ALL` (`frozen.ts:70`). The rule is: **a window already frozen under a key keeps today's
split for that key; every other window switches**, including old months never frozen under that key. Measured
(probe `prod-2026-10-09-ren-frozen-keys-readonly.out`): production has `INSTAGRAM` for Sep, Aug, Jul and `ALL` for Sep,
Aug, Jul, Jun, Mar-Jul and Mar-Aug; staging has `INSTAGRAM` for Sep, Jul, Jun and `ALL` for Sep, Jul.
- Switched windows: co-authored and UGC Instagram posts leave Renaissance's owned Top Content (Instagram tab and
  Overview) and appear on the Influencer tab.
- Kept windows: the posts carry no authors, so `ownHandlesFor` logs "no post authors" and the split falls back to #ad
  for owned posts (`outline-top-content.ts:47-52, 71-73`). UGC marks are absent too, so UGC posts also keep today's split.
- **Accepted mismatch.** Where one key is frozen and the other is not (production June: `ALL` frozen, `INSTAGRAM` not),
  the first view after the handle is saved freezes the other key with authors, and a co-authored post can be Owned on one
  tab and Influencer on the other for that historical window. The Influencer tab follows the Instagram key, so it always
  agrees with the Instagram tab; Overview is the one that can differ. Avoiding it needs data work on Renaissance's frozen
  rows, which is not approved. The team can align any post with "· change" (a stored designation wins on every key).
- **Log noise.** The "no post authors" warning repeats on every render of a kept window (those rows are never refrozen).
  Accepted: it names the slug and channel and is the signal that the window predates the rule.

## 7. Edge cases

| # | Case | Behaviour |
|---|---|---|
| E1 | Client hides Overview and has the Influencer tab | Order Instagram, Influencer, …; opens on Instagram (section 3) |
| E2 | Client has no Influencer tab | Order unchanged except Influencer absent |
| E3 | Old link to `?subsection=organic-influencer` | Resolves by id, unchanged |
| E4 | A Recommendations save posted under `organic-social:influencer:recommendations` | Refused by `isCommentaryViewKey` |
| E5 | `public_views` missing, null, a string, negative, NaN, or Infinity | `publicViews` absent; Views as today |
| E6 | `views` > 0 and `public_views` present | `views` wins (fallback only when `impressions` is 0) |
| E7 | No post on the tab has any views | Total Views "—", "Not reported for these posts", as today |
| E8 | Locked month (A Place For Mom September) | Fallback works from the stored raw answer |
| E9 | Window frozen before this change (Renaissance) | No `publicViews`, no authors: Views and split as today |
| E10 | `ownHandles.instagram` blank, not a string, or `@`-prefixed | Parsed as today (`outline-top-content.ts:13-18`): blank or non-string is no handle; `@` stripped |
| E11 | Handle saved but no post in the window is by it | `ownHandlesFor` logs and drops it: UGC-marked posts still Influencer (`outline-top-content.ts:29` checks UGC first), the rest #ad |
| E15 | Overview and Instagram keys frozen at different times (Renaissance June) | Accepted mismatch, section 6 |
| E12 | Stored designation on a post | Always wins, both rules |
| E13 | Client read fails | @2 keeps today's split (no handle known); the Influencer tab keeps 'designations' |
| E14 | A Place For Mom and the other @3 clients | Unchanged: they already use 'outline' |

## 8. Operational steps (not code)

- **A Place For Mom's 4 stored Influencer designations** (posts of Sep 4, 17, 26 and 30, all its own, set 2026-10-06 and
  2026-10-07 from Thomas's account; probe `2026-10-09-public-views-and-designations-readonly.out`) are flipped back to
  Organic with "· change" on staging. Owner: Thomas.
- **Renaissance's handle** saved on staging (script, Thomas's go), production at launch (written consent).
- **Whitney's Slack note** after staging, drafted by me.

## 9. Failure handling and visibility

- Dash `public_views` malformed: field absent, nothing thrown (E5).
- `ownHandlesFor` already logs both fallbacks with slug, channel and view (`outline-top-content.ts:70-81`); the @2 path
  passes no `view`, the Influencer tab passes 'influencer', so the lines stay distinguishable.
- A failed client read on @2 logs nothing new and keeps today's split (E13).
- No secret, caption or handle enters a log line beyond the existing `ownHandlesFor` lines (slug and channel only).

## 10. Tests (written before the code)

1. Tab order: the array is Overview, Influencer, Instagram, …; a client with Overview shown gets `[null,
   'organic-influencer', 'organic-instagram', …]`; Overview hidden gives `['organic-instagram', 'organic-influencer', …]`
   and lands on Instagram; no Influencer tab gives today's order minus Influencer. Update the order assertions in
   `subsections.test.ts:10`, `no-overview.test.ts:36`, `tiktok-tab.test.ts:13, 23-24`, `default-channels.test.ts:48`,
   `influencer-tab-list.test.ts:10-12`, the lock-sweep URL order (`lock-sweep.test.ts:34`) and the portal sidebar golden.
2. Recommendations: `recommendationsViewKeyFor('organic-social:influencer')` is null; `isCommentaryViewKey` refuses the
   old key; every other Organic Social key still gets its Recommendations key (`views.test.ts:96-97` updated); the
   Influencer view renders Insights and no Recommendations.
3. `normalizePost`: Instagram `public_views` 704013 gives `publicViews: 704013` for an owned-feed and a UGC-feed post;
   absent, null, string, negative, NaN and Infinity give no field; Facebook with `public_views` gives no field.
4. Influencer tab views, under each of 'outline', 'author' and 'designations': a post with impressions 0 and publicViews
   704013 shows 704013 and counts in Total Views; a post with views 2051 and publicViews 2044 keeps 2051; a post with
   neither stays 0; all-zero gives `views: null`; the rate stays null for the fallback post. The Instagram tab (@2 and
   @3) and Overview render a post carrying `publicViews` with today's Views. A locked read (raw answer through
   `normalizePost`) carries `publicViews`.
5. Author rule on @2: with a handle, co-authored and UGC posts are Influencer, own posts Organic, stored designations
   win; without a handle, the call and split are exactly today's (`fetchTopContentFrozen` called with no injection,
   `partitionPosts` result); Overview with a handle splits Instagram by author and other channels by #ad; a handle with
   posts that carry no author (a kept frozen window) logs the warning and falls back; a failed client read keeps today's
   split; one client read per render.
6. `influencerRulesFor`: @3 gives 'outline' with or without a handle; @2 with a handle gives 'author'; @2 without, @1, or
   no pin gives 'designations'. Influencer tab 'author' mode: same request as the Instagram tab (authors and UGC marks),
   same split, no rate change; 'outline' and 'designations' unchanged (existing `influencer-posts.test.tsx` cases pass).
7. Every existing test passes unchanged except the order assertions in test 1, `views.test.ts:96-97`, and the @2 golden
   (`top-content-v2.golden.test.tsx:43-45`) if the order of its two client reads changes.

## 11. Gates

Organic Social only (the department gate): the diff touches `lib/constants.ts` (the Organic Social list only),
`lib/commentary/views.ts` (one Organic Social key), and Organic Social files. Prove it against the 2026-10-06 department
snapshots before review. Renaissance: changes 1 and 2 touch only the Influencer tab, which production has not shipped;
change 3 adds `publicViews` to Renaissance's newly frozen production rows and gallery props with no visible change;
change 4 changes Renaissance only once its handle is saved, and that save is the consent step. The plan's Renaissance
proof covers the snapshot payload shape, the drift checker (`~/.claude/renaissance-baseline/check-drift.sh`, read before
running) and the rendered pages. Paul reviews the PR; Jasmine and Whitney approve on staging; production Monday at the earliest.
