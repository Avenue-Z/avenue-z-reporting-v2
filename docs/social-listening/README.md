# Social Listening (mockup, pre-spec)

> **Superseded by the real tab.** The team approved this mockup on 2026-11-19, and the tab is now built in the app:
> `lib/organic-social/social-listening/ENGINEERS.md`. This folder stays as the record of what was approved and how the
> layout was decided. The open decisions at the bottom were settled in the spec
> (`docs/superpowers/specs/2026-11-19-social-listening-tab-design.md`): D5 for the baseline, staff type theme trends, the
> Stacker donut is left out, and uploads and analysis live in the app's database.

A clickable mockup of a Social Listening tab under Organic Social for A Place For Mom, built so the team can
react to the format before anything is built in the app. It replaces the monthly social listening deck: the
analyst uploads her Talkwalker exports, the numbers fill in, and she adds her analysis and posts.

Nothing here is app code. No route, component, table or env var changes. When the team signs off, the real
build starts from a spec, on its own feature branch off `dev`.

## What's in this folder

| File | What it is |
|---|---|
| `mock.template.html` | The mockup page with no client data in it. Copies the app's staff shell (sidebar, sticky report header, KPI and chart cards) from `app/globals.css`, `components/layout/sidebar.tsx`, `components/layout/sticky-report-header.tsx` and `components/charts/kpi-card.tsx` |
| `build.py` | Fills the template with a month's private data file and writes the page that gets published |
| `export-coverage.md` | Slide by slide: what the Talkwalker export covers, and what still needs the analyst |
| `export-vs-analyst.html` | The one-page, two-column version of that for the team |

## Client data stays out of this repo

This repo is public. The numbers, the analyst's text, post screenshots, exports and decks live in
`~/code/apfm-social-listening-mock/` on my machine and are never committed:

    data/<yyyy-mm>.js            const D (numbers), PAGE (notice, analyst name), COMM (analysis by box), DEFAULT_POSTS
    inputs/post-images/*.jpg     post screenshots
    inputs/                      the analyst's deck and the Talkwalker export they came from

## Build and publish

    python3 -I docs/social-listening/build.py 2026-10

That writes `~/code/apfm-social-listening-mock/apfm-social-listening.html`, which is published as a private
Claude artifact. Republish the same file path to keep the same link.

## How the mockup works

- **Numbers.** `D.brand` and `D.industry` hold the counts from the brand and industry dashboard exports. Every
  percentage and change is computed in the page from those counts, so it can't disagree with itself.
  "vs Sep report" compares with the previous report as presented to the client.
- **Analysis.** Every section and every chart card has an optional analysis box. A box with no text shows only
  "+ Add analysis" while editing and disappears in "Preview as client". Text the analyst already wrote comes from
  `COMM`, keyed by box.
- **Posts.** Social, forum and web groups. Each post has platform, author, link, engagements, sentiment,
  commentary and screenshots. Add, edit and remove all work.
- **Saving.** Edits are kept in the viewer's own browser (`localStorage`), so nobody else sees them. The real
  build would save them per client and month.

## Open decisions before a spec

1. The baseline for "vs last month": Talkwalker's own comparison, or the previous report as presented.
2. Theme trends (emerging, decreasing, new) exist only on the Talkwalker screen, not in the export.
3. The donut that also drops Stacker and PR earned coverage has no export sheet.
4. Where the analyst's uploads and analysis are stored, and who can edit them.
