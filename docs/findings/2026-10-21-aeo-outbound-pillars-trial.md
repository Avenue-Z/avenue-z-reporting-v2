# Trial: the pillar cards on PocketGuard's real numbers (2026-10-21)

**Question.** What does the pillars section of spec `2026-10-21-aeo-outbound-pillars-design.md` look like, and does it
hold at a desktop, the editor's width and a phone?

**How.** A throwaway script, not in the repo: the real `renderSnapshotHtml` on the v1 fixture with the
brand set to PocketGuard and `sourceMix` set to PocketGuard's real donut weights, read from its staging draft
`4e160c91` (read only); the Opportunities table replaced by three `.cluster-card` cards (AIVx's style) with the spec's
names, descriptions and data lines, and five page rules (3-column grid from 901px, 1 column below). Opened locally.

**Data lines it printed** (the spec's rounding rule):
- Editorial sites make up 19% of the domain mix in this window.
- PocketGuard's own site makes up 4.1% of the domain mix in this window. (The "You" slice; under decision D3 (a) the
  share also counts own subdomains Peec files elsewhere, unverifiable from the page, so this may read slightly higher.)
- Competitors' own websites make up 17% of the domain mix in this window.

**Results.**

| Width | Layout | Card size |
|---|---|---|
| 1440 | 3 columns | 342 x 281 each |
| 1105 (editor) | 3 columns | 230 x 372 each |
| 375 (phone) | 1 column, no horizontal scroll | 327 wide, 235 to 281 tall |

**Settled.** The AIVx card style reads cleanly on all three widths; the data line sits at the bottom of each card under a
divider, so the three lines align across cards on desktop. Nothing overflows. I decide the card look (spec D1) from
the screenshots.
