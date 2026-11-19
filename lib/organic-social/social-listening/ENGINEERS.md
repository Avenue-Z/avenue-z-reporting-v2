# Social Listening tab: how it works

The Social Listening tab under Organic Social replaces the monthly Talkwalker social listening deck. Staff upload the
brand and industry Talkwalker exports for a month, the page fills in, and the analyst adds an analysis box under any chart
or section, featured posts with screenshots, and theme trends. Clients see approved content only.

Spec: `docs/superpowers/specs/2026-11-19-social-listening-tab-design.md` (review log beside it). Plan:
`docs/superpowers/plans/2026-11-19-social-listening-tab.md`. Parser trial: `docs/findings/2026-11-19-social-listening-xls-parser.md`.

Opt in per client. No client has it on until the rollout below.

## The flow

```
setting (dash_social_config.socialListening)      setting.ts: parse, hasSocialListeningTab
   |
served month (the client's locked months)          components/report-sections/organic-social/index.tsx, OrganicSocialBody branch
   |
one read of the stored months + one of the boxes   store.ts getSlMonth, lib/db/queries.ts getCommentaryForViewPrefix
   |
view model: what shows, every number and change   view-model.ts buildTopicView, compare.ts
   |
brand or industry page                             components/report-sections/organic-social/social-listening/
```

## Files

| File | What it does |
|---|---|
| `types.ts` | The shared shapes (frozen, change only by a reviewed PR) |
| `setting.ts` | `{ enabled: true, brandTopic, industryTopic?, industrySample? }`; the tab rule |
| `export-parse.ts` | Talkwalker `.xls` to `SlExport`, rules V1 to V9 (spec section 6) |
| `select.ts` | Current and presented upload (D5), row mappers |
| `store.ts` | The five tables: reads and writes, every write calls `updateTag('db')` |
| `compare.ts` | Changes and year to date (spec section 7) |
| `view-model.ts` | Everything one topic shows, for staff and for the client view |
| `upload-month.ts`, `capabilities.ts` | The upload's month (never from the form) and who may do what |
| `posts.ts`, `image-access.ts` | Post validation, JPEG checks, who may load a screenshot |
| `trends.ts` | Theme trend lines |
| `boxes.ts` | The 26 analysis box ids (commentary view keys) |
| `app/actions/social-listening.ts` | Upload, post, image and trend actions |
| `app/api/social-listening/image/[id]/route.ts` | Screenshots |

## Where every number comes from

All from the month's **current upload** (the newest one), parsed from these export widgets:

| On the page | Export widget | Field |
|---|---|---|
| Results, Unique authors, Engagement, Potential reach | Results, Unique Authors, Engagement, Potential Reach | `results`, `uniqueAuthors`, `engagement`, `potentialReach` |
| Results over time | Results over time | `daily` |
| Share of sentiment, industry share tiles | Share of Sentiment (split) | `sentiment` counts; shares = 100 x count / results, one decimal |
| Without brand-owned channels | Share of Sentiment - Without Brand Owned Channels (optional) | `ownedExcluded` |
| Sentiment by media type, Share of media types | Share of Sentiment (by media type) | `sentimentByMedia`; a type's total = pos + neu + neg |
| Keyword themes | Themes (the two-word list, D4) | `themes` |
| Top authors, overview cards | Top influencers, Overview | `influencers` (columns by header name), `overview` |
| Industry sentiment over time | Results over time by sentiment | `dailyBySentiment` |

**Changes** ("vs <previous month> report") compare with the previous month **as presented** (decision D5, `compare.ts`):

- The previous month's presented values are its history row if there is one, else its **presented upload**: the newest
  upload made before the month opened to the client (`before_open`, stored once at upload), else the first. A re-upload
  after the open date shows on that month's page but never changes what later months compare with.
- Tile change = 100 x (now / previous - 1), rounded by `KpiCard wholeDelta`. A previous value that is missing, null or 0
  shows the "no comparison" placeholder, never Infinity.
- Sentiment points = this month's share minus last month's. Against a history row (whole percents) this month's share is
  rounded to whole first (R2-14).
- Media type change = percent change of the type's result count; influencer change = posts difference, matched by author
  id. Both against the previous presented **upload** only (history rows don't hold them); "n/a" or "new" otherwise.
- **Year to date** = January to the served month, whole percents, each share rounded on its own (a month can sum to 99 or
  101, as the deck charts them). Earlier months from presented values, the served month from its current upload. A month
  with neither is a gap, never zero. Reddit uses the Reddit row of sentiment by media type, or a history row's Reddit
  columns.

## Who sees what

- Staff (@avenuez.com) upload, write analysis, add and edit posts and trends. `COMMENTARY_APPROVERS` approve and revoke
  posts, trends and analysis (`capabilities.ts`, the analysis boxes are commentary).
- `clientView` = a client role **or any PDF export** (`section.tsx`). Under it: no controls, no drafts, no staff notes,
  analysis-only sections only with approved text, approved posts only (at most 12, 4 images each), approved trends only.
  A staff member's export therefore prints exactly what the client sees.
- No brand upload: staff get the upload control; a client sees only "This month's social listening report isn't ready
  yet." No industry upload: the client gets no Industry pill.
- The PDF prints brand then industry, whichever pill was open (R2-5). `sl=industry` opens the Industry pill on the page.
- Screenshots (`/api/social-listening/image/[id]`): staff see all; a client role only an approved, current post of its
  own client, with the tab on, in a month it may open. Anything else is 404. `?print=1` is the 60 KB print copy.

## Limits

Export 2 MB (server action body 3 MB, `next.config.ts`); screenshot 300 KB JPEG at 1,200 px and a 60 KB print copy at
600 px, made in the browser and checked again on the server by size, frame header and pixel size; 4 images a post;
12 approved posts a month; note 1,000 characters; links https only. The database checks the month (always the 1st) and
the file and image sizes too.

## Switching it on (each step needs Thomas's go)

1. Apply migration `drizzle/0030_social_listening.sql` (five new tables, nothing else changes) on the database.
2. Set `dash_social_config.socialListening` for the client, for example
   `{ "enabled": true, "brandTopic": "<brand topic name>", "industryTopic": "<industry topic name>", "industrySample": 10 }`.
   The topic names must equal the first item of each export's filter line (rule V5). The client must be on locked months.
3. Backfill `social_listening_history` from the team's private history sheet (a guarded script outside this repo, dry run
   and rollback). The sheet's "Monthly history" tab has two tables: whole-percent sentiment by month (brand, Reddit,
   industry) and the headline numbers of the months that have them. Each month gives a brand row, plus an industry row
   when its industry columns are filled. The headline percents must round to the sentiment table's whole percents, and
   a month is written only once Confirmed is ticked on the sheet. October is not uploaded: the tab starts with November,
   which compares with October's history row.
4. Staging, then production, as in spec section 13.

## Private checks (outside this repo)

`~/.claude/organic-social-work/social-listening/real-export-check.mts` runs the parser on the real October exports and
compares every field with the earlier independent parse. Run it after any parser change. It holds client data, so it
never comes into this repo.
