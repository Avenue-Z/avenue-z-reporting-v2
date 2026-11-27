# Decisions for Approval — Technical Audit Page

**If you disagree with any item, or it's not what you expected, flag it now.** Anything marked ⚠️ is a choice you might not expect.

---

### ⚠️ 1. Each month's snapshot comes from the monthly Screaming Frog crawl, not the Technical Audit Log

As in the mockup, there's no date picker: a drop-down lists each month, newest first, and the whole page compares that month with the one before. Under it, the page shows the date each tool last checked the site, since the three tools don't run on the same day.

The brief anchors each snapshot on a run in the Technical Audit Log. We checked the Log: its monthly run is set to manual and last ran in June, and it only stores summary scores. The Screaming Frog crawls themselves still run every month and save a dated folder per brand in Drive, so we'd use those as the list of snapshots, one per monthly crawl.

Two things to know. The scheduled crawl only exports the "Internal: All" file today, so the **Issues Overview** report needs adding to its export settings on the office audit machine. And there was **no crawl in August** for any brand; the page will warn the team when a month is missed instead of silently skipping it.

**→ Confirm the monthly crawl folders as the snapshot list.**

---

### 2. Ahrefs is pulled automatically and matched to the crawl, as the brief describes

Each snapshot pulls the Ahrefs health score and full issue list on its own, from the most recent Ahrefs crawl on or before the Screaming Frog crawl and within 7 days. We checked the account: it's on the Advanced plan with 2 million API units a month (this needs about 50 per brand per month), and there are Site Audit projects for 24 sites, including Renaissance, crawled weekly. If there's no Ahrefs crawl in the window, the tile says "No data for this snapshot."

**→ Confirm.**

---

### ⚠️ 3. Two of Google's numbers are estimates, clearly labeled, unless someone uploads the GSC reports

Google doesn't offer the Page Indexing or Core Web Vitals reports through any API, so an automatic page can't show those exact numbers. Rather than make uploads mandatory every month, we'd fill both tiles with the closest figures Google does provide, labeled as estimates:

**Pages in Google:** we ask Google about every page on the brand's sitemap (the list of pages the site tells Google about) and count how many are indexed and how many aren't, with Google's reason for each. That covers sitemap pages only, so it won't match GSC's all-pages total.

**Page experience (Core Web Vitals):** we look up Google's real-visitor speed and stability scores for each of those pages, on mobile and desktop, rate each page by its worst score as GSC does, and count Good, Needs improvement and Poor pages. Pages with too few visitors have no data and aren't counted; GSC has the same limit.

If someone uploads that month's two GSC exports, the tiles switch to GSC's exact numbers for that month. So the brief's "totals match GSC" check only holds for months with an upload.

We checked this against Renaissance. GSC's own report filtered to the main sitemap shows 601 indexed and 321 not indexed (922 pages), the same pages our estimate checks. GSC's Core Web Vitals report only has data for about 172 Renaissance pages (all Good on mobile; 8 Need improvement on desktop).

**→ Confirm labeled estimates with optional uploads — or say GSC must always match the report, which makes uploads required every month.**

---

### 4. Two of the six trend KPIs are measured on sitemap pages

The trend line needs the same measure every month, and only the estimates exist every month. So the two indexing KPIs become "% of sitemap pages indexed" and "not-indexed sitemap pages". The two Core Web Vitals KPIs keep the brief's names (Poor CWV URLs and Good CWV URLs %, mobile). Month-to-month changes never compare an uploaded GSC number with an estimate, so a month with an upload doesn't show a false jump.

**→ Confirm.**

---

### ⚠️ 5. One combined, ranked list of what to fix

The three tools often flag the same problem under different names. The table merges them into one row, with each tool's own name and count shown underneath, and ranks the rows so the most serious, widespread, multi-tool and worsening issues come first, using the brief's formula.

When tools disagree on how many pages are affected, the row shows the **highest** count, never the sum, so nothing is counted twice. (Ahrefs and Screaming Frog give counts, not page lists, so a combined de-duplicated list isn't possible.) When two tools flag different pages for the same issue, the row can read a little low.

**→ Confirm the highest-count rule.**

---

### 6. Every issue is tagged, and gaps are shown as gaps

Each row is tagged New, Worsening, Improving or Unchanged versus the previous month; rows that reach zero drop out and count as "resolved since last month"; the first month is marked Baseline. If a tool didn't run in a month, its section says "No data for this snapshot" rather than reusing older numbers or showing zero, which would make every issue look fixed.

**→ Confirm.**

---

### 7. The brief's sitemap rule applies to every estimated GSC row

The brief raises some low-severity GSC reasons (page with redirect, alternate canonical, excluded by noindex) to High when the page is in the sitemap. Our estimate only checks sitemap pages, so every such estimated row is raised to High. For months with an uploaded export those rows stay Low, because the export doesn't say which pages are in the sitemap.

**→ Confirm.**

---

### ⚠️ 8. Fixing the issue map also changes past months

The issue map (which tool's issue name counts as the same issue) lives in a Google Sheet the AEO team edits, as the brief asks. We'd apply the current map to every month, so mapping a "Needs mapping" row or correcting one also fixes older months. The trade-off: a past month a client has already seen can reorder slightly, while its approved commentary stays as written. The alternative is to lock the map each month used, which keeps history fixed but leaves old mistakes in place.

**→ Confirm — or say past months should keep the map they had.**

---

### ⚠️ 9. Snapshots publish themselves

Not in the brief. A month fills in over a few days. Clients only see it once it's published, and it publishes itself as soon as every source is in, or 7 days after the crawl with whatever arrived (missing tiles marked). The team can hold a month back, publish early, or unpublish.

**→ Confirm automatic publishing — or say every month should wait for someone to publish it.**

---

### ⚠️ 10. Today's AI-crawler sections stay, below the new ones, marked as current

The brief doesn't mention what's on the tab today: AI bot activity, where AI activity and technical issues overlap, crawler waste, the fix list, and the Sitebulb AEO checklist. We're keeping them under the new sections. Most can't be tied to a past month (bot activity always covers the last 30 days; Sitebulb holds only its latest crawl), so they sit under a divider reading **"Current AI-crawler activity · not tied to the selected snapshot,"** each with its own as-of date. The fix list's explainer is renamed "How is the fix list scored?" so it isn't confused with the new ranking.

While checking the data we found the fix list and overlap table have been reading a Screaming Frog crawl from **May**. They'll move to the latest monthly crawl.

**→ Confirm keep-and-label — or say they should only appear on the latest month, or be removed.**

---

### ⚠️ 11. Three of today's crawl sections are removed

The current tab has its own crawl summary cards, a "What changed since the last crawl?" table and a "How are technical issues trending?" chart. The new health tiles, change strip and merged issue table cover the same ground across more tools, so we'd remove the old three rather than show two versions of the same story.

**→ Confirm nothing a client relies on lives only in those three.**

---

### 12. Commentary is switched on per brand, Renaissance first

Commentary follows the selected month, as the brief asks: one summary per month, drafts internal, clients only see approved summaries, and the box is hidden from clients for a month with none. It's turned on per brand like every other tab, with the same approver list as the rest of the report. Until we know approvers per brand, we'd turn it on for Renaissance only.

**→ Name approvers per brand if they differ, and confirm Renaissance-only to start.**

---

### 13. Smaller assumptions — flag any you'd expect differently

- The Screaming Frog tile's bars count **issue types**, with pages affected underneath, matching the mockup (the brief's fifth open question).
- Every tile has an ⓘ saying where its number comes from, including whether a GSC tile is an estimate or the uploaded report.
- The indexing gauge isn't colored as pass/fail, per the brief; some pages are kept out of Google on purpose. Core Web Vitals opens on Mobile.
- One snapshot per brand per crawl, and one domain per brand; brands with more than one domain aren't covered in the first version.
- A new month normally appears within about a week of the crawl.
- The selected month is part of the page link, so a shared link or PDF opens on the same month, and the PDF only shows approved commentary.
- The page uses the reporting site's existing colors; we took the mockup's layout, not its palette.
- Everything applies to both the internal view and the client portal. Upload, hold and publish controls are internal only.

**→ Any of these not what you'd expect?**

---

## What we need from the team

- **Screaming Frog (Jake or Thomas):** add the Issues Overview report to the scheduled crawl's Drive export on the office audit machine. Until it's added, the Screaming Frog tile and its issue rows stay empty. (Item 1.)
- **Ahrefs crawl health:** Renaissance's Ahrefs crawl stops at its maximum depth (Ahrefs warns the site "may not be fully crawled"), so its counts may run low. Should someone raise the depth limit? Separately, Cpap and Prometeoapi have never crawled, and E2open's last crawl failed. (Item 2.)
- **Issue map review:** who on the AEO team corrects the first issue map? We'll draft it from the real issue names. (Item 8.)
- **Commentary:** who approves for each brand, and is this page client-facing for every AEO brand or team-only at first? (Item 12, and the brief's third open question.)

## Questions to ask each client at rollout

- Are there pages they keep out of Google on purpose (member-only, campaign or test pages)? Then we treat them as intentional, not as problems.
- Do they care more about mobile or desktop? We'd default to mobile.
- Who on their side should see the page, and do they want a heads-up when each new month is published?
