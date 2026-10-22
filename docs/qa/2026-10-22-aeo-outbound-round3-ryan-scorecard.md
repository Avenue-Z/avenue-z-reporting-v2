# AI Visibility Snapshot: round 3 acceptance scorecard (Ryan's feedback)

Source of every requirement: the Slack thread between Ryan Cadigan and Thomas Chang (round 3), and the
audit slide "The Pillars of AI Search". Ryan's words are quoted first in each section. Nothing here comes
from how the tool was built.

## How to use this scorecard

**Check tags**

| Tag | Meaning |
|---|---|
| **M** | Must-pass. Directly states what Ryan asked for (or what Thomas agreed to). |
| **S** | Strict reading of an ambiguous ask. Test the strict reading; if it fails but the stated fallback passes, record "PASS (fallback)" and flag it for Ryan. |
| **A\*** | Adversarial extra that still blocks: Ryan did not ask for it, but a fail means the prospect would see something false, contradictory or broken. |
| **A** | Adversarial extra, non-blocking. Record the result; it goes to Thomas as a finding, not a fail of Ryan's requirement. |
| **O** | Observe and record only. No pass or fail. |

**Views.** Run every check in all three views unless the check says otherwise:
- **V1** editor (where the salesperson edits before approving),
- **V2** full-size preview,
- **V3** the approved / shared page (what the prospect receives).

If the tool has a download or export (PDF or similar), treat it as **V4** for every naming, order, toggle
and placeholder check, and record if it does not exist.

**Widths.** Default is a desktop window 1440 px wide. Layout checks also name 1280 and 1024.

**Projects to run on.** Use as many as exist; record which project each result came from.
- **P1** PocketGuard (Ryan's working example). Every check runs on P1.
- **P2** a project where the prospect has the highest visibility in the bar chart (rank 1).
- **P3** a project where the prospect has zero or very low citations, or ranks last.
- **P4** a project for which the data source has no technical suggestions (Thomas noted 5 of the last
  20 pitch projects have none).
- **P5** a project with few competitors (under 5) and, if available, one with 10.

**Reading numbers off charts.** Before checking any bullet, write down from the page itself:
every bar's brand name and visibility value on the Competitive Visibility bar chart (labels or hover
tooltip), every Domain Type and its percentage on the Cited Sources donut and list, and any citation
totals the page shows. All arithmetic checks compare against these recorded values, never against
Ryan's PocketGuard example numbers, which were illustrative. Rounding tolerance for computed values is
plus or minus 0.1 percentage points unless a check says "equal as displayed".

**Note on Ryan's PocketGuard examples.** They are internally consistent and can be used to sanity-check
the arithmetic method: top-three average 53.8% minus 20.5 gives PocketGuard at 33.3%; 5.4 behind Quicken
puts Quicken at 38.7%; a 7.8-point range across Quicken (38.7%), PocketGuard and You Need A Budget puts
You Need A Budget at 30.9%. Do not expect the live page to show these numbers.

---

## R1. 50 prompts (out of scope for the tool)

> "50 prompts for the instant pitch projects (ON RYAN'S END)"

Out of scope: this is project setup Ryan does himself. Nothing in the tool must change.

1.1 **[O]** Look at every page for a stated count of prompts, tracked answers or queries (for example
"across N prompts"). Record the number and where it appears, per project. No pass or fail; if P1 shows
something other than 50, note it for Ryan.

1.2 **[A]** If a prompt or tracked-answer count appears in more than one place (two pages, or V1 vs V3),
PASS: every occurrence shows the same number. FAIL: two different counts on one report.

## R2. 5 to 10 competitors (out of scope for the tool)

> "5-10 competitors (ON RYAN'S END)"

Out of scope: Ryan sets the competitor list per project.

2.1 **[O]** On the Competitive Visibility bar chart, count the bars that are not the prospect. Record
the count per project. Note for Ryan any project outside 5 to 10. Not a tool fail.

2.2 **[A]** If the tool shows the project's competitor list anywhere (project picker, setup screen),
PASS: every listed competitor appears as a bar, or the page says why one is missing. FAIL: a configured
competitor silently absent from the chart (for example the chart is cut to the top 5 when 8 are set up).
N/A if the tool shows no competitor list.

## R3. Headline Signal page renamed to Executive Summary

> "Changing headline signal page title to Executive Summary"

Ambiguity: casing. Strict reading: the exact string "Executive Summary" in title case, as Ryan typed it.
Fallback: if every side menu entry and page heading is rendered in one uniform style (for example all
uppercase "EXECUTIVE SUMMARY"), that passes with a note, as long as the words are exactly these two.

3.1 **[M]** Look at the side menu entry for this page. PASS: it reads "Executive Summary" (strict) or the
uniform-style equivalent (fallback), with its section number. FAIL: "Headline Signal", "Headline
Signals", "Exec Summary", "Executive summary" next to title-case siblings, or any other wording.

3.2 **[M]** Look at the page heading in the report body. PASS: same rule as 3.1. FAIL: the menu is
renamed but the heading (or an eyebrow or label above it) still says the old name.

3.3 **[M]** In each of V1, V2, V3 (and V4), use the browser's find (Cmd+F) for "headline". PASS: zero
matches that refer to the page name, including menu, headings, browser tab title, editor field labels,
buttons, tooltips and empty states. FAIL: any surviving "Headline Signal" anywhere.

3.4 **[M]** PASS: the menu entry and heading read identically in V1, V2, V3 and V4. FAIL: renamed in one
view only.

3.5 **[A]** Click the "Executive Summary" menu entry in each view. PASS: it lands on that page. FAIL: the
link is dead or lands elsewhere after the rename.

3.6 **[O]** If a report approved before this change can still be opened, record what its menu and
heading say. No pass or fail.

## R4. Toggle the Opportunities page on or off (agreed)

> Ryan: "Inquire about toggle on/off the Opportunities page. Allowing sales person reviewing before
> sending to include this page, or toggle off, depending on if they like the findings generated."
>
> Thomas (agreed): "Toggle: yes, doable. I will make it so that you can turn the Opportunities page on or
> off before sending."

Ambiguity: whether the Opportunities page should vanish from the editor when off, or stay visible there
marked as excluded so it can still be reviewed. Strict reading: in V1 it is either gone or unmistakably
marked as not included; in V2, V3 and V4 it is completely gone. Ambiguity: the default state was not
specified; record it (4.9).

4.1 **[M]** In V1, before approval, look for a control that turns the Opportunities page on and off.
PASS: a visible, clickable control whose label or position makes clear it controls the Opportunities
page. FAIL: no control; a control only reachable by URL, settings outside the report or a developer;
an unlabeled switch whose target is unclear.

4.2 **[M]** Turn it OFF. Look at V1 and V2 menu and body. PASS: V2 has no Opportunities menu entry and no
Opportunities content; V1 either has neither or shows the page clearly marked as excluded. FAIL: the
page still shows in V2, or in V1 there is no visible difference between on and off.

4.3 **[M]** With it OFF, approve the report and open V3 (and V4). PASS: no Opportunities menu entry, no
Opportunities heading, no pillar content; Cmd+F for "Opportunit" and "pillar" finds nothing. FAIL: any
of these present, including a menu entry that leads to an empty page.

4.4 **[M]** On a fresh report, with it ON, approve and open V3 (and V4). PASS: the full Opportunities page
and its menu entry are present. FAIL: the page is missing even though the toggle was on.

4.5 **[M]** Set it OFF, reload the editor, leave and return to the report. PASS: still OFF. Repeat with ON.
FAIL: the state resets on reload or navigation, so what was approved is not what the salesperson set.

4.6 **[A\*]** With it OFF, read the section numbers in the menu and on page headings in V1, V2, V3. PASS:
numbers are continuous (for example 1, 2, 3, 4 with no gap) and menu numbers match heading numbers.
FAIL: a skipped number (1, 2, 4) or a menu number that disagrees with the heading number. Tag reason:
Ryan did not ask about numbering, but a gap looks broken to the prospect.

4.7 **[A]** Edit the Opportunities text, turn the toggle OFF, then ON again. PASS: the edits are still
there. FAIL: toggling discards or regenerates the content.

4.8 **[A\*]** In V3 with it OFF: there is no control the prospect can use to turn the page back on, and
adding an anchor to the URL (for example `#opportunities`) or using the menu does not reveal the hidden
content. FAIL: the prospect can see content the salesperson chose to withhold.

4.9 **[O]** Generate a new report and record the toggle's default state (on or off). Ryan did not say.

4.10 **[A]** After approval, record whether the toggle can still be changed. If it can, PASS: V3 follows
the change, or V1 clearly says the sent version is unaffected. FAIL: V1 shows one state and V3 another
with no indication.

4.11 **[A]** If the report shows a page count, contents list or "N sections" anywhere, PASS: it reflects
the toggle. FAIL: it counts the hidden page.

## R5. Opportunities page follows the three pillars

> Ryan, 10:14: "Updating Opportunities page to follow the three pillars shown in our audit slide
> (https://canva.link/zdo9bh0xskm6ujr). Instead of half baked recommendations and too many words, keep to
> three objective findings from the technical, earned, and content lens."
>
> Ryan, Q2 answer: "Are we able to show each of those pillars like what the slide I attached in my last
> message shows? The point of the Opportunities page is not to have recommendations, but insights."
>
> "For earned we can have the insight be "X percent of citation sources are coming from editorials".
> Shows need for earned placement. This way we keep it very factual, but it's not recommending anything.
> Just linking data to pillar."
>
> "For content we could say what percentage of citations are currently coming from the target domain. If
> the prospect, our working example is PocketGuard, had zero percent citations, or a low percent
> citation, this pillar is where we want that data point connected"
>
> "For technical we should connect to a data point that shows how often competitors are cited as sources
> because that shows the importance of a website."
>
> "In summary: Introduce the pillars, borrow from the three pillars slide that I linked in my previous
> message. Have a one liner under each pillar that connects the data from this report to each."

### Slide transcription ("The Pillars of AI Search")

Title: **The Pillars of AI Search** (side label "AI COMMERCE"). Three cards side by side, left to right,
each with a title, a thin rule, a description, then a list:

| Card | Title (exact) | Description (exact as on slide) | List items |
|---|---|---|---|
| 1 (green glow) | Earned & Affiliate Media | "Quality Citations from Trusted Media Publications are a key factor in determining the credibility and authority of information." | Featured Media Hit (Men's Health logo), Premium Affiliate Feature (GQ), Featured Media Hit (TechCrunch), Affiliate Placement (Us Weekly), Niche Affiliate Placement (P logo) |
| 2 (blue glow) | Content and Creative | "Publish high quality content that mimics natural language, rather than keyword stuffed blogs, to better influence LLMs for..." (truncated on the slide itself) | Website Content, On-Site SEO / AEO, Natural Language Q&A, Multimedia & Visual Content, Social Media Content |
| 3 (purple glow) | Technical Optimizations | "Technical data structuring ensures your brand authority is optimized for AI crawlability and visibility across LLMs." | Website Optimizations, LLM Crawlability, ChatGPT Shopping Feeds, Continuous LLM Optimization, Authority Signal Boost |

Note the slide spells card 1 with "&" and card 2 with "and".

### 5A. Structure

5A.1 **[M]** Count the findings on the Opportunities page. PASS: exactly three pillar findings, one each
for Earned, Content and Technical. FAIL: two or four; two findings under one pillar; any leftover
recommendation bullet from the old page.

5A.2 **[S]** Pillar titles. Strict: exactly "Earned & Affiliate Media", "Content and Creative",
"Technical Optimizations" as on the slide. Fallback: "Earned", "Content", "Technical" (Ryan's
shorthand). FAIL both: any other name (for example "PR", "On-site", "Authority"), or a finding with no
pillar name.

5A.3 **[S]** Pillar order. Strict: Earned, Content, Technical, left to right (or top to bottom), matching
the slide. Fallback: any order. Note: Ryan wrote "technical, earned, and content" at 10:14 and "earned,
content, technical" in his Q2 answer; the slide settles it for the strict reading.

5A.4 **[S]** Layout like the slide. Strict: at 1440 px, three side-by-side cards, each with its title,
then its description, then its one-liner. Fallback: three clearly separated blocks stacked vertically,
each with a title. FAIL both: one paragraph, or a plain bullet list without pillar headings.

5A.5 **[M]** "Too many words." PASS: the page holds only the pillar introduction, three pillar titles,
their descriptions and one line of data per pillar (plus the slide's list items if 5A.7 finds them).
FAIL: extra paragraphs, "next steps", a summary block, or any finding longer than one sentence.

5A.6 **[A]** At 1280 and 1024, and in V2 and V3: PASS: cards do not overlap, no text is clipped or cut
with "...". Stacking into one column at narrow width is acceptable if each card stays intact. FAIL:
overlapping or clipped text.

5A.7 **[O]** Record whether the slide's list items (Featured Media Hit, Website Content, LLM
Crawlability, and so on) or the publication logos appear. Ryan did not ask for them explicitly. If they
appear, flag for Ryan that they are Avenue Z service lines and may read as a pitch rather than an
insight.

### 5B. Introduce the pillars, one-liner under each

5B.1 **[M]** Look at the top of the Opportunities page. Strict PASS: the slide title "The Pillars of AI
Search" (that casing) introduces the three pillars. Fallback PASS: an intro line that names the three
pillars of AI search. FAIL: the pillars appear with no introduction.

5B.2 **[S]** Each pillar's description. Strict: the slide's description text verbatim or near-verbatim
(same claims, same key terms: "Quality Citations from Trusted Media Publications"; "natural language,
rather than keyword stuffed blogs"; "Technical data structuring", "AI crawlability"). Fallback: a
faithful paraphrase of the same idea. FAIL both: no description, or a description that claims something
the slide does not.

5B.3 **[A\*]** The Content pillar description. PASS: a complete sentence. FAIL: it copies the slide's
truncation and ends in "for..." or any trailing ellipsis or dangling word.

5B.4 **[M]** Placement. PASS: each data one-liner sits under its own pillar (inside that pillar's card or
block, after its title). FAIL: the three lines are collected in a separate list, or a line sits under
the wrong pillar.

5B.5 **[S]** Length. Strict: each one-liner is exactly one sentence. Fallback: one short line at 1440 px.
FAIL both: two or more sentences, or a line that wraps into a paragraph.

5B.6 **[M]** PASS: each one-liner contains at least one number taken from this report. FAIL: a generic
statement with no number (for example "Earned media builds authority").

### 5C. Earned pillar line

5C.1 **[M]** PASS: the Earned line states the percentage of citations (Ryan: "citation sources") that
come from editorial sources, in the spirit of "X percent of citation sources are coming from
editorials". FAIL: a different source type, a count instead of a percentage, or no editorial figure.

5C.2 **[M]** Compare with the Editorial value in the Cited Sources Domain Types list and donut. PASS:
equal as displayed. Fallback PASS: differs only in decimal places and rounds to the same whole number.
FAIL: any other difference.

5C.3 **[M]** If the Source-Type Mix bullet on Cited Sources names Editorial, PASS: its percentage equals
this line's. FAIL: two different editorial percentages on one report.

5C.4 **[A\*]** On a project where Editorial is 0% or absent from the donut: PASS: the line reads "0%" (or
an equivalent true statement) as a complete sentence. FAIL: blank, "NaN", "undefined", "null", "-%",
or the pillar disappears.

5C.5 **[S]** Strict: the source type is named exactly as the donut names it (for example "Editorial").
Fallback: "editorials" or "editorial sources", recognisably the same type.

### 5D. Content pillar line

5D.1 **[M]** PASS: the Content line states what percentage of citations come from the prospect's own
domain, naming the prospect or its domain. FAIL: no prospect-domain figure, or a figure about
competitors or source types instead.

5D.2 **[S]** Metric. Strict: it is a share of citations (the prospect's citations out of all citations),
worded as citations. FAIL strict: it reuses the Citation Rate ("% of tracked answers") from Cited
Sources, which is a different measure. Fallback: if it uses the answers-based rate, it must be worded as
answers, not citations, and match the Citation Rate bullet exactly. FAIL both: a percentage worded as
"of citations" that equals the "of tracked answers" figure because it is the same number relabeled.

5D.3 **[M]** Consistency. If the page shows the total number of citations anywhere, PASS: the line's
percentage equals the Citation Volume count divided by that total (plus or minus 1 point for rounding).
If no total is shown, record "cannot cross-check". FAIL: a figure that contradicts the page's own counts.

5D.4 **[M]** On P3 (zero or very low citations): PASS: the line shows the zero or low percentage
explicitly ("0%") in a complete sentence. Ryan named this case as the reason for the pillar. FAIL: the
line is hidden, blank, or replaced by generic text when the value is zero.

5D.5 **[A\*]** PASS: if Citation Volume on Cited Sources is above 0, this line does not say exactly "0%"
without qualification ("under 1%" or one decimal is fine). If Citation Volume is 0, this line is 0%.
FAIL: the two contradict each other.

### 5E. Technical pillar line

5E.1 **[M]** PASS: the Technical line states how often competitors are cited as sources (a share or count
of citations from competitor sites). FAIL: anything else, for example a site-health or page-count
statement.

5E.2 **[M]** PASS: the line does not use the data source's suggested site fixes and lists none (nothing
like "Give this page an H1 heading"). FAIL: any fix list or fix count.

5E.3 **[M]** On P4 (no technical suggestions): PASS: the Technical line still shows a competitor-citation
data point. FAIL: blank, "no data", the pillar missing, or a claim that the site is clean.

5E.4 **[S]** Strict: any competitor or competitor domain the line names is a brand shown on the
Competitive Visibility bar chart. Fallback: any competitor named anywhere on the report. FAIL both: a
publisher, forum or unlisted brand treated as a competitor.

5E.5 **[A]** If the same competitor-citation figure (or the counts behind it) appears elsewhere, for
example in Competitor Domain Gaps, PASS: it matches. FAIL: a contradiction.

5E.6 **[A\*]** If competitors have zero citations: PASS: the line reads "0%" (or a true equivalent) as a
complete sentence. FAIL: blank, "NaN" or a missing pillar.

### 5F. Insights, not recommendations

5F.1 **[M]** Read each of the three one-liners. PASS: each states a fact. FAIL: any imperative or advice:
verbs telling the prospect to act (invest, publish, pitch, secure, build, optimize, add, fix, improve,
increase, target, prioritize, focus, earn) or advice wording ("should", "need to", "must", "consider",
"we recommend", "opportunity to", "to close the gap").
Ambiguity: Ryan's own example follows the data with "Shows need for earned placement." Strict reading:
that was his commentary to Thomas, so the line holds the data statement only (plus at most a neutral
link to the pillar). Fallback: a single neutral phrase such as "which shows need for earned placement"
is accepted because Ryan wrote it; anything stronger fails both.

5F.2 **[S]** Strict: no judging adjectives ("weak", "poor", "alarming", "critical", "only") that the data
does not itself state. Fallback: "only" allowed when literally true of the number. Ryan: "keep it very
factual".

5F.3 **[O]** The slide's Content description begins "Publish high quality content", which is imperative.
Because Ryan asked to borrow the slide, borrowed description text is not counted against 5F.1. Record
whether it appears.

5F.4 **[A]** After reload, in V2 and V3, and after any regenerate: PASS: none of the old Opportunities
recommendations reappear. FAIL: old content survives in any view.

## R6. Swap Competitive Visibility and Cited Sources; rename Category Data to Cited Sources

> "Competitive Visibility page and Category Data page (to be renamed to Cited Sources) are going to be
> switched, so Competitive Vis page will go before it."

Ambiguity: "switched" could mean the two trade places (so they were neighbours and stay neighbours) or
only that Competitive Visibility comes somewhere earlier. Strict reading: Competitive Visibility is
immediately before Cited Sources (numbers N and N+1). Fallback: Competitive Visibility anywhere before
Cited Sources. Casing follows the same rule as R3.

6.1 **[M]** Side menu. PASS: an entry reading "Cited Sources". FAIL: "Category Data", "Cited sources" next
to title-case siblings, "Citations", "Sources" or any other wording.

6.2 **[M]** Page heading in the body. PASS: "Cited Sources". FAIL: menu renamed but heading or eyebrow
still old.

6.3 **[M]** Cmd+F for "Category Data" (and "category" to review hits) in V1, V2, V3, V4 and the browser
tab title. PASS: no hit that names this page. FAIL: any survivor, including editor labels or chart
titles.

6.4 **[M]** Order in the menu. Strict PASS: Competitive Visibility is numbered N and Cited Sources N+1.
Fallback PASS: Competitive Visibility appears anywhere before Cited Sources. FAIL: Cited Sources first.

6.5 **[M]** Scroll the body top to bottom. PASS: the pages appear in the same order as the menu, and any
section numbers on headings match the menu numbers. FAIL: menu reordered but body not, or numbers
disagree.

6.6 **[M]** PASS: names and order are identical in V1, V2, V3 and V4. FAIL: any view differs.

6.7 **[A]** Click each of the two menu entries in each view. PASS: each lands on the page of that name.
FAIL: an entry lands on the other page (stale anchor after the swap).

6.8 **[A\*]** If any text on the report refers to a section by number or name (for example "see section
3" or "Category Data"), PASS: it points to the right section after the swap and rename. FAIL: a stale
cross-reference.

6.9 **[O]** Record the full menu, with numbers, for each view and each project.

6.10 **[S]** PASS: the other page still reads exactly "Competitive Visibility". FAIL: renamed or
abbreviated (for example "Competitive Vis").

## R7. Bullets fit each page now that Category Data is Cited Sources

> "Confirming the cleared up renaming of the Category Data page will better improve the tools created sub
> bullets, it will give the tool more direction."

Thomas replied that renaming alone would not change the bullets and asked Ryan how each page's bullets
should read; Ryan answered with the templates in R11 and R12. These checks confirm each page's bullets
belong to that page; R11 and R12 test the templates.

7.1 **[M]** PASS: every Cited Sources bullet is about citations and sources (volume, rate, source-type
mix). FAIL: a visibility-rank or competitor-gap bullet on Cited Sources.

7.2 **[M]** PASS: every Competitive Visibility bullet is about visibility rank against competitors. FAIL:
a source-type or citation-volume bullet on Competitive Visibility.

7.3 **[A]** PASS: no sentence is repeated word for word on two pages. FAIL: duplicated bullet.

## R8. Domain Types list in two columns

> "Split the Domain Types listed in the chart on the right of the Cited Sources page into 2 columns vs.
> one."

8.1 **[M]** V1 at 1440 px, Cited Sources page, the Domain Types list beside the donut. PASS: the entries
are laid out in two columns. FAIL: one column, or three or more.

8.2 **[M]** PASS: two columns in V2, V3 and V4 as well. FAIL: two columns in one view only.

8.3 **[M]** PASS: every domain type that has a slice on the donut appears exactly once in the list, with
its name and percentage on one line, nothing clipped, overlapping or cut with "...". FAIL: a missing,
doubled, clipped or wrapped-apart entry.

8.4 **[M]** PASS: each percentage in the list equals its donut slice value (hover tooltip) as displayed,
and equals the figures used in the Source-Type Mix bullet (R11) and the Earned line (5C). FAIL: any
mismatch.

8.5 **[A]** With an odd number of types: PASS: column lengths differ by at most one and the reading order
is consistent (all down-then-across or all across-then-down), keeping the original ranking order. FAIL:
order scrambled by the split (for example the largest type no longer first).

8.6 **[A]** At 1280 and 1024: PASS: still two columns, or a clean collapse to one column with no overlap
with the donut. Record the width at which it collapses. FAIL: entries overlap the donut or each other.

8.7 **[S]** PASS: the list still carries the heading "Domain Types" (Ryan's term). Fallback: an
equivalent heading. FAIL both: no heading.

8.8 **[A]** PASS: the listed percentages sum to 100% (plus or minus 1 for rounding), or the remainder is
shown as its own entry. FAIL: shares that visibly do not add up.

8.9 **[A]** PASS: each entry's colour marker matches its slice colour. FAIL: a mismatched or missing
marker.

## R9. Bar chart: no big gap under the title, no grey gradient behind the bars

> "Adjust the spacing of the bar chart in the Competitive Visibility visual so there is not a big gap
> between the chart and the overhead title. In addition, eliminate the grey gradient behind the bars"

Ambiguity: "big gap" has no number. Strict reading: the space between the chart's title and the top of
its first bar is no larger than the space between the Cited Sources card's title and the top of its
content in the same view. Fallback: no more than about one bar row (bar plus its spacing). Ambiguity:
whether the hover highlight counts as grey behind the bars. Strict: yes. Fallback: static view only.

9.1 **[M]** V1, V2, V3 at 1440 px. PASS: the gap meets the strict reading (or the fallback, flagged).
FAIL: a visibly empty band between title and bars.

9.2 **[M]** Static view, no hover. PASS: nothing grey or graded behind the bars: no background panel, no
full-width grey track behind each bar, no fade. FAIL: any of these in any view.

9.3 **[S]** Hover over each bar. Strict PASS: no grey rectangle or highlight band appears behind the
hovered bar. Fallback PASS: static view clean (9.2), hover band recorded. FAIL both: grey gradient in
static view.

9.4 **[A]** On P5 with few competitors: PASS: the chart height fits the bars, with no large empty area
above or below them. With 10 competitors: PASS: every bar and label visible, none clipped, no scrolling
inside the chart. FAIL: the gap reappears because the chart height is fixed.

9.5 **[A]** PASS: spacing and background look the same in V1, V2, V3, V4 and at 1280 and 1024. FAIL:
fixed in one view only.

9.6 **[A]** If the tool has a light and a dark theme, PASS: no grey gradient in either.

9.7 **[O]** Record whether each bar's visibility value can be read (label or tooltip). If it cannot be
read in any view, mark every arithmetic check in R12 "cannot verify" and flag it.

## R10. Competitor Domain Gaps lists only competitor domains

> "For the COMPETITOR DOMAIN GAPS: section on Competitive Visibility page, some of the domains listed were
> not competitors mentioned. Only include competitor domains"

Ambiguity: "competitors mentioned". Strict reading: competitors shown as bars on the Competitive
Visibility chart. Fallback: any competitor named anywhere on the report.

10.1 **[M]** PASS: the Competitive Visibility page still has the "COMPETITOR DOMAIN GAPS" section (Ryan
asked to fix its contents, not remove it). FAIL: the section was removed, which hides the problem rather
than fixing it. If it is hidden only because nothing qualifies, see 10.6.

10.2 **[M]** For every domain listed, name the charted competitor it belongs to. Strict PASS: every domain
belongs to a brand on the bar chart. FAIL: a publisher, review site, forum, video site or encyclopedia
(for example reddit.com, nerdwallet.com, forbes.com, youtube.com, wikipedia.org) unless that site is
itself a charted competitor; or the domain of a brand not on the chart.

10.3 **[M]** PASS: the prospect's own domain is not listed. FAIL: it is.

10.4 **[S]** Strict PASS: the page makes each domain's owner unambiguous (the competitor's name is shown
beside it, or the domain plainly contains the brand name). Fallback PASS: the tester can confirm the
owner from common knowledge (for example ynab.com belongs to You Need A Budget). FAIL both: an owner
nobody can confirm.

10.5 **[A]** PASS: no domain appears twice in another form (quicken.com and www.quicken.com). FAIL:
duplicates.

10.6 **[A\*]** On a project where no competitor domain qualifies: PASS: a clear empty state, or the
section is omitted with nothing broken. FAIL: the list is padded with non-competitor domains.

10.7 **[A]** Run 10.2 to 10.5 on P1 and at least two other projects. FAIL if any project fails.

10.8 **[A]** If counts or percentages appear beside domains, PASS: they agree with the Technical pillar
line (5E) where the two measure the same thing. FAIL: a contradiction.

## R11. Cited Sources bullets (Ryan's Q1 templates, green-lit)

> "1. CITATION VOLUME
> `[Brand domain] appears in [X] retrieved citations.`
> PocketGuard: PocketGuard.com appears in 678 retrieved citations.
> 2. CITATION RATE
> `[Brand] is cited in [X]% of tracked answers.`
> PocketGuard: PocketGuard is cited in 12% of tracked answers.
> 3. SOURCE-TYPE MIX
> `[X]% of citations come from [Source Type], followed by [Source Type] at [Y]%; [Source Type] accounts
> for [Z]%.`
> PocketGuard: Corporate sources account for 37% of citations, followed by Editorial sources at 19%; UGC
> accounts for 8%."
>
> Final message: "We have the green light, all looks good here"

11.0 **[M]** PASS: exactly three bullets, in this order, each with its label: Citation Volume, Citation
Rate, Source-Type Mix. Strict: labels uppercase as Ryan typed them ("CITATION VOLUME", "CITATION RATE",
"SOURCE-TYPE MIX", with the hyphen). Fallback: the same words in another casing. FAIL both: missing or
extra bullets, wrong order, missing labels, or old bullets left alongside.

**Bullet 1, Citation Volume**

11.1 **[M]** PASS: the sentence follows "[Brand domain] appears in [X] retrieved citations." word for
word ("appears in", "retrieved citations", final period). FAIL: different wording (for example "is
cited", "citations retrieved", "mentions").

11.2 **[S]** The brand domain. Strict: the prospect's domain with the brand's casing, as in Ryan's example
("PocketGuard.com"). Fallback: lowercase domain ("pocketguard.com"). FAIL both: the brand name without a
domain, or a competitor's domain.

11.3 **[M]** PASS: X is a whole number and agrees with any other count of the prospect's citations on the
report. FAIL: a decimal, a percentage, or a contradiction.

11.4 **[A]** With X = 1 record whether it reads "1 retrieved citations" (template literal) or "1 retrieved
citation". With X = 0 PASS: reads "0". FAIL: blank or placeholder.

11.5 **[O]** With X of 1,000 or more, record whether a thousands separator is used.

**Bullet 2, Citation Rate**

11.6 **[M]** PASS: the sentence follows "[Brand] is cited in [X]% of tracked answers." word for word, and
[Brand] is the brand name (not the domain) spelled as on the bar chart. FAIL: other wording, the domain
used, or a different spelling.

11.7 **[S]** Strict: X is a whole percentage between 0 and 100, as in the example. Fallback: one decimal.
FAIL both: over 100, negative, or missing "%".

11.8 **[A\*]** PASS: if Citation Volume is above 0, Citation Rate is above 0 (or shown as "under 1%"); if
Citation Volume is 0, Citation Rate is 0%. FAIL: the two contradict.

11.9 **[A]** If the page states how many answers were tracked, PASS: rate times answers is no more than
Citation Volume (a cited answer carries at least one citation). Record if not checkable. FAIL: the rate
implies more cited answers than citations.

**Bullet 3, Source-Type Mix**

11.10 **[M]** Structure. Ryan's template and his example differ in wording. Strict PASS: the sentence
matches one of them exactly in word order and punctuation (comma after the first clause, semicolon
before the third, final period): template "[X]% of citations come from [Type], followed by [Type] at
[Y]%; [Type] accounts for [Z]%." or example "[Type] sources account for [X]% of citations, followed by
[Type] sources at [Y]%; [Type] accounts for [Z]%." Fallback: the same three clauses with minor wording.
FAIL both: fewer or more than three types, or a different structure.

11.11 **[M]** PASS: each of the three percentages equals that type's value in the Domain Types list and
donut, as displayed. FAIL: any mismatch.

11.12 **[M]** PASS: the first-named type is the largest slice and the second-named is the second
largest, so X is at least Y. FAIL: types out of order.

11.13 **[S]** Strict: the third-named type is the third largest slice. Fallback: any type on the donut,
with its value matching. (Ryan's example cannot settle this: UGC at 8% may or may not be third.)

11.14 **[S]** Strict: type names match the donut labels exactly, optionally followed by "sources" as in
Ryan's example. Fallback: recognisably the same type. FAIL both: a type name that does not appear on the
donut.

11.15 **[A\*]** Edge cases (look for a project with fewer than three types, a tie, or a 0% type). PASS:
the sentence stays grammatical and true, with no clause for an absent type, no "0%" filler clause, no
type named twice and no blank. FAIL: any of those.

11.16 **[O]** If the donut has a catch-all type ("Other", "Unknown"), record whether the sentence names it.

## R12. Competitive Visibility bullets (Ryan's Q1 templates, green-lit)

> "1. NEXT-TIER GAP
> `[Brand] is [X] percentage points behind [next-higher brand] in visibility.`
> PocketGuard: PocketGuard is 5.4 percentage points behind Quicken in visibility.
> 2. TOP-TIER DISTANCE
> `[Brand] is [X] percentage points below the average visibility of the top [N] brands.`
> PocketGuard: PocketGuard is 20.5 percentage points below the top-three average visibility of 53.8%.
> 3. PEER CLUSTER
> `[Brand] sits within a [X]-point visibility range alongside [Peer 1] and [Peer 2].`
> PocketGuard: PocketGuard sits within a 7.8-point visibility range alongside Quicken and You Need A
> Budget."

12.0 **[M]** PASS: exactly three bullets, in this order, with labels Next-Tier Gap, Top-Tier Distance,
Peer Cluster. Strict: uppercase as typed ("NEXT-TIER GAP", "TOP-TIER DISTANCE", "PEER CLUSTER").
Fallback: same words, other casing. FAIL both: missing, extra, reordered or unlabeled bullets.

**Bullet 1, Next-Tier Gap**

12.1 **[M]** PASS: the sentence follows "[Brand] is [X] percentage points behind [next-higher brand] in
visibility." word for word. FAIL: "%" instead of "percentage points", "below" instead of "behind", or
other wording.

12.2 **[M]** PASS: the named brand is the one immediately above the prospect on the bar chart (the
smallest visibility greater than the prospect's). FAIL: the leader, a brand below, or a brand not on the
chart.

12.3 **[M]** PASS: X equals that brand's value minus the prospect's value, from the recorded bar values,
within 0.1. FAIL: any larger difference.

12.4 **[S]** Strict: X has one decimal place as in the example ("5.4"). Fallback: whole number. FAIL both:
more than two decimals.

12.5 **[A\*]** On P2 (prospect ranked first): PASS: the bullet makes no false claim; it does not say the
prospect is behind anyone and does not name a lower brand as "next-higher". Record what it shows. Also
record what it says for an exact tie. FAIL: a false sentence.

12.6 **[A]** PASS: every brand name in R12 bullets is spelled exactly as on the bar chart (for example
"You Need A Budget", not "YNAB", if the chart says the former).

**Bullet 2, Top-Tier Distance**

12.7 **[S]** Ryan's template and example differ: the example names the average ("the top-three average
visibility of 53.8%"). Strict PASS: the example form, including the average value, because it lets the
prospect check it. Fallback PASS: the template form ("below the average visibility of the top [N]
brands."). FAIL both: N or the comparison missing.

12.8 **[M]** If the average is shown, PASS: it equals the mean of the top N bar values, within 0.1. If not
shown, compute it. FAIL: wrong mean, or the stated N does not match the number of brands averaged.

12.9 **[M]** PASS: X equals the average minus the prospect's value, within 0.1. FAIL: otherwise.

12.10 **[A\*]** On P2 (prospect inside the top N): PASS: the sentence is true. It never says "below" when
the prospect's value is at or above the average. Record whether the top N includes the prospect. FAIL: a
false "below" claim or a negative X.

12.11 **[O]** Record N for each project (Ryan's example uses three).

**Bullet 3, Peer Cluster**

12.12 **[M]** PASS: the sentence follows "[Brand] sits within a [X]-point visibility range alongside [Peer
1] and [Peer 2]." word for word, including the hyphen in "[X]-point". FAIL: other wording.

12.13 **[M]** PASS: X equals the highest minus the lowest visibility among the prospect, Peer 1 and Peer
2, within 0.1. FAIL: otherwise.

12.14 **[M]** PASS: both peers are brands on the bar chart, neither is the prospect, and they are two
different brands. FAIL: otherwise.

12.15 **[S]** Strict: the peers are the prospect's nearest neighbours in visibility, so no other charted
brand would make a tighter three-brand range that includes the prospect. Fallback: any two charted
brands with X computed correctly. FAIL both: X wrong.

12.16 **[A\*]** On a project with fewer than three brands, or where the prospect is last: PASS: the
sentence is true and grammatical (or the bullet is omitted cleanly). FAIL: a missing peer name, "and
undefined", or a false range.

12.17 **[A]** If Peer 1 or Peer 2 is the next-higher brand from 12.2, PASS: X here is at least the
Next-Tier Gap. FAIL: a smaller range, which means one of the two bullets is wrong.

## R13. Cross-cutting checks (all adversarial extras)

13.1 **[A]** Edit one bullet on each page and one pillar line in V1, reload. PASS: edits persist and appear
identically in V2 and, after approval, V3. FAIL: edits lost or not carried through.

13.2 **[A\*]** PASS: every bullet, pillar line, chart value, title and section number reads identically
in V1, V2, V3 and V4. FAIL: any difference the salesperson did not make.

13.3 **[O]** If the tool can regenerate a report, record whether regenerated bullets still follow R11 and
R12 and whether manual edits survive.

13.4 **[A\*]** In V3, Cmd+F for each of: "[", "{", "undefined", "NaN", "null", "Infinity", "-%". PASS: no
hit inside report text. FAIL: any placeholder or broken value reaches the prospect.

13.5 **[A]** PASS: the browser tab title names the report or prospect and no old section name. FAIL: an
old name.

13.6 **[A\*]** If the Executive Summary repeats any figure from Competitive Visibility or Cited Sources,
PASS: the figures match. FAIL: a contradiction between pages.

13.7 **[A]** PASS: R3 to R12 hold on P1 and at least one other project. FAIL: holds only on PocketGuard.

---

## Summary

| Requirement | Checks | Must-pass (M, plus A\* which block) |
|---|---|---|
| R1. 50 prompts (Ryan's end, out of scope) | 2 | none |
| R2. 5 to 10 competitors (Ryan's end, out of scope) | 2 | none |
| R3. Headline Signal renamed Executive Summary | 6 | 3.1, 3.2, 3.3, 3.4 |
| R4. Opportunities on/off toggle (agreed) | 11 | 4.1, 4.2, 4.3, 4.4, 4.5, 4.6\*, 4.8\* |
| R5. Opportunities as three pillars (10:14 bullet and Q2 answer) | 33 | 5A.1, 5A.5, 5B.1, 5B.3\*, 5B.4, 5B.6, 5C.1, 5C.2, 5C.3, 5C.4\*, 5D.1, 5D.3, 5D.4, 5D.5\*, 5E.1, 5E.2, 5E.3, 5E.6\*, 5F.1 |
| R6. Swap pages, rename Category Data to Cited Sources | 10 | 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.8\* |
| R7. Bullets fit each page | 3 | 7.1, 7.2 |
| R8. Domain Types in two columns | 9 | 8.1, 8.2, 8.3, 8.4 |
| R9. Bar chart gap and grey gradient | 7 | 9.1, 9.2 |
| R10. Competitor Domain Gaps: competitors only | 8 | 10.1, 10.2, 10.3, 10.6\* |
| R11. Cited Sources bullet templates | 17 | 11.0, 11.1, 11.3, 11.6, 11.8\*, 11.10, 11.11, 11.12, 11.15\* |
| R12. Competitive Visibility bullet templates | 18 | 12.0, 12.1, 12.2, 12.3, 12.5\*, 12.8, 12.9, 12.10\*, 12.12, 12.13, 12.14, 12.16\* |
| R13. Cross-cutting (adversarial) | 7 | 13.2\*, 13.4\*, 13.6\* |
| **Total** | **133** | **73** (57 M, 16 A\*) |

\* marks an A\* check: an adversarial extra Ryan did not ask for, kept as blocking because a fail puts
something false or broken in front of the prospect.

S checks (strict readings of ambiguous asks) are not in the must-pass column: a fail on the strict
reading with a pass on the fallback is recorded as "PASS (fallback)" and raised with Ryan, not treated as
a fail.
