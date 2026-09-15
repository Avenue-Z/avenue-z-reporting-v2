# Performance Decks: scope and open questions

Working doc for the `performance-decks-dashboard` branch. Code for the deck
snapshot work lands here.

**No client identifiers in this repo.** Dash Social brand ids, and the identity
of clients not already named in this codebase, are treated as secret and live
only in Neon. This repo is public, so nothing here names a brand id, and new
client rows are created directly in the database rather than in a committed
script or fixture.

---

## 1. Why this exists

Avenue Z produces a recurring Organic Social performance deck per client. Today
large parts of it are assembled by hand: an analyst opens Dash Social, sets
filters, screenshots a card row, and pastes the image into a PowerPoint template.

This platform already pulls the same Dash Social data and renders it as an
interactive dashboard, so the deck is being screenshotted from a vendor UI while
we hold the same numbers. The goal is to drive the deck from our own data.

The template's "Top Performers" slides are the first target. Each shows five
posts for one platform, ranked by views on one slide and by engagements on the
next, with four metric rows per card and the active sort metric bolded.

## 2. What already works

Verified read-only, 2026-09-15.

- **Ranking.** `sortPosts` and `paginate` (`lib/organic-social/sort-content.ts`)
  are pure, and `SortKey` already includes `impressions` and `engagements`, which
  are exactly the two orderings the slides use. The dashboard card already bolds
  the active sort metric, matching the slide.
- **Freezing.** Once a reporting window closes, the app snapshots that window's
  posts into `top_content_snapshots` and stops querying the vendor for them
  (`lib/organic-social/frozen.ts`). So a closed period's numbers are already
  stable and cannot drift under a client.
- **Creative.** Post image and video URLs are public and unsigned, and every post
  in a recent sampled month carried both a creative and a permalink.

## 3. What does not exist yet

- **A locked client view.** There is no fixed, allowlisted, or per-client
  date-range setting anywhere in the codebase. Every client currently gets the
  full date picker and can roll it forward to today. Restricting a client to a
  single closed period is code, not configuration, and it is the main work this
  branch is named for.
- **Three fields the slide shows and the model does not keep.** The card renders
  a Viewers figure, a video duration badge, and a time of day. Duration and the
  full timestamp are both already present in the vendor payload and discarded
  during normalization (`top-content.ts` truncates `source_created_at` to a date;
  `creative.ts` reads the video object's sizes and thumbnails but not its
  duration). Viewers is not requested at all, and cannot be reliably derived: the
  obvious arithmetic divides by zero on any zero-engagement post, which was the
  majority of one sampled month.
- **Platform coverage beyond four channels.** `CHANNELS`
  (`lib/organic-social/metrics.ts`) lists Instagram, Facebook, X and LinkedIn.
  The vendor returns more, so additional platforms are an extension of the
  per-channel field maps rather than a vendor limitation.

## 4. Open questions

1. **Cadence.** The freeze logic keys off a window being closed, and rolling
   windows are deliberately never frozen. A weekly deck therefore needs its
   period defined as a closed week, not a rolling seven days, or nothing freezes.
   Confirm the intended cadence before building the locked view.
2. **Who triggers the freeze.** A period only freezes on the first render of a
   closed window, so somebody has to open it. It is not a scheduled job, and the
   cache-warm cron will not do it because that cron renders a rolling window. A
   locked view has to decide what it shows when nothing has been frozen yet.
3. **Viewers.** Add the field to the fetch, or change the deck template to use
   Effectiveness, which is already captured and carries the same signal. Note
   Effectiveness is null on two of the four channels.
4. **Backfill.** Snapshots are frozen blobs, so adding fields does not backfill
   existing rows. Decide whether historical periods get re-fetched or whether new
   fields simply start from the next period.
5. **Owned versus influencer.** Posts whose caption carries an ad or sponsored
   tag are auto-classified as influencer and split out of the main ranking
   (`lib/organic-social/designations/`). Decide whether the deck ranks the owned
   bucket, which is what the dashboard shows, or the unsplit set, which is what
   the current hand-made slides show.

## 5. Out of scope here

Client onboarding. Adding an Organic Social client is a database change only: one
`clients` row with `enabled_reports` of `organic-social` and a
`dash_social_config`, plus `users` rows where a client-side login is needed. No
code, no migration, and no committed configuration. It is done directly in Neon,
per environment.
