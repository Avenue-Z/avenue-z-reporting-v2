# Finding: SheetJS 0.20.3 reads the Talkwalker exports (scratch trial, 2026-11-19)

Question: can the app parse the real Talkwalker dashboard exports in Node with SheetJS, and is the npm package safe to use?
Settled when every compared value matched the earlier Python (xlrd) parse. Throwaway code in the session scratchpad,
run on the private October files; nothing written anywhere. No client values are recorded here.

## Result: yes, with `xlsx` 0.20.3 from the SheetJS CDN tarball

- Install: `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, lockfile integrity
  `sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==`, installed with
  `--ignore-scripts`.
- Brand export (14 sheets) and industry export (6 sheets): both start with the OLE2 signature (V1 holds).
- Equal to the Python parse, field by field: brand results, unique authors, engagement, potential reach, every daily
  value, sentiment split, sentiment by media type, the owned-channels split, the top 30 two-word themes with share and
  colour, the five influencers' posts, reach and engagement; industry results, daily, daily by sentiment, sentiment
  split, sentiment by media type, top 25 themes. 16 of 16 checks passed.
- Themes widgets: brand has two (25 entries all three words; 120 entries all two words), industry one (25, two words).
  The spec's rule (pick the widget with no three-word entries) picks the right one on both.
- Dates arrive as text (`MM/DD/YY hh:mm:ss AM`), so the parser reads them as text, never as Excel serials.
- V7 holds on the real brand file: results = sum of daily = sentiment total = sentiment-by-media total.

## Advisories

| Advisory | Severity | Affects | Fixed (per the advisory text) |
|---|---|---|---|
| GHSA-4r6h-8v6p-xvw6 (CVE-2023-30533), prototype pollution when reading crafted files | HIGH | through 0.19.2 | 0.19.3, CDN only |
| GHSA-5pgg-2g8v-p4x9 (CVE-2024-22363), ReDoS | HIGH | before 0.20.2 | 0.20.2, CDN only |

npm's last published `xlsx` is 0.18.5, affected by both. The OSV records list no fixed version for the npm package
(`introduced: 0`, no `fixed` event), so `osv-scanner` on a lockfile with 0.20.3 still reports both, with no fix
available. The repo's SCA gate (`.github/sca-policy.json`, tier `client-facing`) never blocks a finding with no
available fix, so it reports them and does not fail. The PR should say why they are false positives for 0.20.3.
