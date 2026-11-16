# Finding: how big is one AEO Informed Social result, and does it fit Next's cache?

Date: 2026-11-12. Task 6 Step 0 of `docs/superpowers/plans/2026-11-12-aeo-informed-social-tab.md`.

## Question

Next's data cache refuses an item over 2 MB. The tab's 6 and 1 hour caches, and the lock store's cached read
(`lib/organic-social/response-lock-store.ts:22`), all keep a result there. Does a YTD result fit?

## What I ran (read only)

One live call through the adapter for Renaissance's Peec project (a private probe, nothing written anywhere), YTD
2026-01-01 to 2026-11-11, Instagram as the fourth graph. Sizes are the JSON a cache entry holds.

| | min 2 | min 1 |
|---|---|---|
| Time | 44.8 s | 43.6 s |
| Every tagged URL (`socialsAll`) | 7,377 rows, 4,427 KB | same |
| Own channels / competitors | 27 / 16 rows | same |
| URL Gaps | 948 rows, 609 KB | 2,233 rows, 1,319 KB |
| Whole result | 5,103 KB | 5,813 KB |
| Without `socialsAll` | 676 KB | 1,386 KB |

The data checks passed on live data in both runs (0 errors), including the new citation rate, totals and min
competitors rules.

## What it settled

- The whole result is over the limit, so it would never be cached: every view would pull from Peec for about 45
  seconds, and every view of a locked month would pull 5 MB from Neon.
- Nearly all of it is the list of every tagged URL, which only the "All tagged URLs" switch used. The outline's written
  filter is "your channels only" (P029). My call: no switch, and the tab never stores `socialsAll`.
- Without it a YTD result is 676 KB at the default min of 2 and 1,386 KB at min 1. It fits, but All time keeps
  growing every month, so a stored result over 1.5 MB logs a warning (follow-up in CLAUDE.md).
