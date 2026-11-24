# Social Listening feedback, 2026-11-24

The feedback list for this PR. Each item gets traced to the code before anything is built.

## 1. Analysis boxes sit apart from the charts

**What I want:** the analysis boxes come out of the chart cards and sit apart from them, so the charts inside a row of
cards line up evenly.

**Why it looks off today:** every chart card puts its analysis box inside the card, under the chart
(`components/report-sections/organic-social/design/frames.tsx:17-31`). Two cards side by side stretch to the same
height, but when one card has an extra line under its chart (the brand-owned note, `social-listening/brand.tsx:124`)
or a longer analysis, its chart and box sit at a different height from its neighbor's.

**Things to check before building:**
- The box went inside the card because the team asked for that on 2026-11-19 (`frames.tsx:1-3`). This reverses it.
- `SlCard` is also used by the Organic Social kit's YTD block (`parts/ytd-kit.tsx:17`), so a change there reaches
  that block too unless it is scoped to Social Listening.
- A card is one block in the PDF export (`data-export-block`, `frames.tsx:21`). The box needs to stay with its chart
  in the PDF.

## 2. From the call and the checklist

To be added.
