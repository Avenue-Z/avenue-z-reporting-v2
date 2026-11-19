# What the Talkwalker export covers in the October deck

Date: 2026-11-19. Mapped from Savannah's October 2026 deck (33 slides) against the brand export
(`APFMBrandSentiment_20261119-101110.xls`, 14 sheets) and the industry export (6 sheets, pulled 2026-11-12).

## The key

- **Export**: the number or chart comes straight from the export. Can be automated.
- **Export + last month**: the number comes from the export; the "vs last month" change needs last month's
  stored export or report. Can be automated once each month is kept.
- **Export + history**: this month comes from the export; earlier months come from the history sheet. Can be
  automated.
- **Dashboard only**: Talkwalker shows it on screen but the export leaves it out. Needs a screenshot, a typed
  entry, or a new widget.
- **Analyst**: a person's judgment (picks, writing). Not automatable; the dashboard can only give it a place.
- **Not Talkwalker**: comes from another source.
- **Fixed**: set once per client, rarely changes.

## Slide by slide

| Slide | What's on it | Source | Automate? |
|---|---|---|---|
| 1 | Cover, month | Fixed | Yes |
| 2 | Brand topic purpose and keywords | Fixed | Yes |
| 3 | Brand media types and filters | Fixed (the export's filter line can check it) | Yes |
| 4 | Results, authors, engagement, reach tiles | Export | Yes |
| 4 | Change on each tile | Export + last month | Yes, once we pick the baseline (below) |
| 4 | Results over time | Export | Yes |
| 5 | Sentiment donut | Export | Yes |
| 5 | Sentiment by media type | Export | Yes |
| 6 | Without APFM's own channels donut | Export | Yes |
| 6 | Also without Stacker and PR earned coverage | Not in export | No, unless the dashboard gets a widget for it |
| 7 | Sentiment, January to now | Export + history | Yes |
| 8 | Positive + neutral, January to now | Export + history | Yes |
| 9 | Share of media types, and media type by sentiment | Export | Yes |
| 9 | Change per media type | Export + last month | Yes |
| 10 | Reddit sentiment, January to now | Export + history | Yes |
| 11 | Keyword theme cloud | Export | Yes |
| 12 | Emerging, decreasing and new themes | Dashboard only | No: screenshot or typed in, or our own estimate from two months of exports (won't match Talkwalker's %) |
| 13 | Top conversation themes | Analyst | No |
| 14 | Overview cards (most active and influential) | Export | Yes |
| 14 | Top 5 influencers | Export | Yes |
| 14 | Change per influencer | Export + last month | Yes |
| 15 to 19 | Featured social, forum and web posts | Analyst | Partly: the results CSV (a second export) lists every post to pick from; the picks and screenshots are hers. Reddit can't be exported at all |
| 20 | Brand key takeaways | Analyst | No |
| 21 | Industry topic purpose | Fixed | Yes |
| 22 | Industry media types and filters | Fixed | Yes |
| 23 | Industry results tile and results over time | Export | Yes |
| 23 | Change on the tile | Export + last month | Yes |
| 24 | Industry sentiment donut, sentiment by media type, sentiment over time | Export | Yes |
| 24 | Change on each sentiment | Export + last month | Yes |
| 25 | Industry sentiment, May to now | Export + history | Yes |
| 26 | Industry keyword theme cloud | Export | Yes |
| 27 | Industry top conversation themes | Analyst | No |
| 28 | Industry key takeaways | Analyst | No |
| 29 to 32 | Paid ads comment sentiment | Not Talkwalker | No: needs the paid ad comment file, and who sends it is still open |
| 33 | Thank you | Fixed | Yes |

## In short

- **Automatable:** every number and chart on slides 4 to 11, 14 and 23 to 26, plus the fixed slides.
- **Needs a decision before it can be automated:**
  1. The baseline for "vs last month". Savannah's deck uses Talkwalker's own arrow (September as Talkwalker
     shows it today). Our rule D5 uses September as the client saw it. They give different numbers.
  2. Theme trends (slide 12): screenshot, typed in, or our own estimate.
  3. The second donut on slide 6: a new dashboard widget, or drop it.
- **Stays with the analyst:** conversation themes, featured posts (Reddit by screenshot), takeaways.
- **Outside Talkwalker:** paid ads.
- **One thing to watch:** Talkwalker keeps revising a month after it ends, so the export must be pulled once,
  after cleanup, and kept. Every number then comes from that one file.
