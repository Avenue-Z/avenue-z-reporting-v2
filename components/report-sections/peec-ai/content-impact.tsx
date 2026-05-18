import { FileText, Sparkles, Clock, TrendingUp, TrendingDown, Globe2, Search } from 'lucide-react'

// ---------------------------------------------------------------------------
// Content Impact Tracker
// PRD Sections A–J
//
// Live data:  None yet — requires content calendar, GA4 page-level sessions,
//             Peec AI URL-level citation data, GSC crawl data, server-side
//             page scraper (for AI bot log analysis)
//
// This component renders the full PRD structure with proper column schemas
// and empty states, ready for data wiring.
// ---------------------------------------------------------------------------

function SectionCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-bg-surface p-6">
      <div>
        <h3 className="text-sm font-bold text-white">{title}</h3>
        <p className="mt-1 text-xs text-text-muted">{description}</p>
      </div>
      {children}
    </div>
  )
}

function KpiCard({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-white/[0.06] bg-bg-surface p-4">
      <span className="text-[11px] font-semibold text-text-muted">{label}</span>
      <span className="text-xl font-bold text-white/20">—</span>
      <span className="text-[10px] text-text-muted">{hint}</span>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap pb-2.5 pr-5 text-left text-[10px] font-bold uppercase tracking-wider text-text-muted last:pr-0">
      {children}
    </th>
  )
}

function EmptyBody({ cols, message }: { cols: number; message: string }) {
  return (
    <tr>
      <td colSpan={cols} className="py-10 text-center text-xs text-text-muted">{message}</td>
    </tr>
  )
}

const MATCH_STATUS_COLORS: Record<string, string> = {
  Matched: 'bg-[#60FF80]/10 text-[#60FF80]',
  Unmatched: 'bg-white/[0.06] text-white/40',
  Redirected: 'bg-[#FFFC60]/10 text-[#FFFC60]',
  Unpublished: 'bg-[#FF4444]/10 text-[#FF4444]',
}


export function ContentImpactReport() {
  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#60FF80]/10">
          <FileText className="h-5 w-5 text-[#60FF80]" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-white">Content Impact Tracker</h2>
          <p className="mt-0.5 text-sm text-text-muted">
            Which content assets earn LLM citations, where content investments translate into AI visibility, and what the content team should build next.
          </p>
        </div>
      </div>

      {/* ── Section A: KPI Strip ── */}
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">KPI Strip</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Planned URLs"                  hint="Content calendar · total" />
          <KpiCard label="Live URLs"                     hint="GA4 · active pages" />
          <KpiCard label="Total Sessions"                hint="GA4 · 30d" />
          <KpiCard label="AI Citations"                  hint="Peec AI · owned domains" />
          <KpiCard label="AI-Referred Sessions"          hint="GA4 · AI source sessions" />
          <KpiCard label="Owned URLs with AI Activity"   hint="URLs cited or crawled by AI" />
          <KpiCard label="% Null / Unmatched"            hint="URLs not in content calendar" />
          <KpiCard label="% Cited in AI"                 hint="Owned URLs cited ÷ total live" />
        </div>
      </div>

      {/* ── Section B: Planned Content Performance Table ── */}
      <SectionCard
        title="Planned Content Performance"
        description="Each planned content URL tracked against GA4 sessions, AI citations, and content calendar metadata. Match status classifies whether the live URL resolves cleanly to a planned asset."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <Th>URL / Title</Th>
                <Th>Content Type</Th>
                <Th>Status</Th>
                <Th>Sessions (30d)</Th>
                <Th>AI Citations</Th>
                <Th>AI-Referred Sessions</Th>
                <Th>Match Status</Th>
                <Th>Content Action</Th>
                <Th>Time to 1st Traffic</Th>
                <Th>Time to 1st AI Activity</Th>
                <Th>Opportunity Score</Th>
              </tr>
            </thead>
            <tbody>
              {/* Sample schema rows (ghost) */}
              {[
                { url: '/blog/example-post', type: 'Blog / Article', status: 'Live', matchStatus: 'Matched', action: 'New' },
                { url: '/resources/case-study', type: 'Case Study', status: 'Live', matchStatus: 'Matched', action: 'Optimized' },
                { url: '/faq/services', type: 'FAQ Page', status: 'Live', matchStatus: 'Unmatched', action: 'Other' },
              ].map((row, i) => (
                <tr key={i} className="border-b border-white/[0.04]">
                  <td className="py-2.5 pr-5 font-medium text-white/20">{row.url}</td>
                  <td className="py-2.5 pr-5 text-white/20">{row.type}</td>
                  <td className="py-2.5 pr-5">
                    <span className="rounded-full bg-[#60FF80]/10 px-2 py-0.5 text-[10px] font-semibold text-[#60FF80]/40">{row.status}</span>
                  </td>
                  <td className="py-2.5 pr-5 tabular-nums text-white/20">—</td>
                  <td className="py-2.5 pr-5 tabular-nums text-white/20">—</td>
                  <td className="py-2.5 pr-5 tabular-nums text-white/20">—</td>
                  <td className="py-2.5 pr-5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold opacity-30 ${MATCH_STATUS_COLORS[row.matchStatus]}`}>
                      {row.matchStatus}
                    </span>
                  </td>
                  <td className="py-2.5 pr-5 text-white/20">{row.action}</td>
                  <td className="py-2.5 pr-5 tabular-nums text-white/20">— days</td>
                  <td className="py-2.5 pr-5 tabular-nums text-white/20">— days</td>
                  <td className="py-2.5 tabular-nums text-white/20">—</td>
                </tr>
              ))}
              <tr>
                <td colSpan={11} className="py-6 text-center text-xs text-text-muted">
                  Connect content calendar (CSV or Notion) + GA4 page-level data to populate
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-1.5 rounded-lg border border-white/[0.04] bg-white/[0.02] p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Match Status Definitions</p>
          <div className="flex flex-wrap gap-3">
            {Object.entries(MATCH_STATUS_COLORS).map(([status, cls]) => (
              <span key={status} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{status}</span>
            ))}
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-white/40">Unknown</span>
          </div>
          <p className="text-[10px] text-text-muted">Content Action: <span className="text-white/40">New</span> = net-new publish · <span className="text-white/40">Optimized</span> = existing page updated · <span className="text-white/40">Other</span> = unclassified</p>
        </div>
      </SectionCard>

      {/* ── Section C: Time to First Traffic and Time to First AI Activity ── */}
      <SectionCard
        title="Time to First Traffic and Time to First AI Activity"
        description="For each published URL, measures days from publish date to first GA4 session and first AI citation or bot crawl. Shows whether AI systems index content faster or slower than search engines."
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { icon: Clock, label: 'Median Days to First Traffic', color: '#39A0FF' },
            { icon: Clock, label: 'Median Days to First AI Activity', color: '#60FDFF' },
            { icon: TrendingUp, label: 'Fastest AI-Indexed Content', color: '#60FF80' },
            { icon: TrendingDown, label: 'Slowest AI-Indexed Content', color: '#FF4444' },
          ].map(({ icon: Icon, label, color }) => (
            <div key={label} className="flex flex-col gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <Icon className="h-4 w-4" style={{ color }} />
              <span className="text-[11px] font-semibold text-text-muted">{label}</span>
              <span className="text-lg font-bold text-white/20">—</span>
            </div>
          ))}
        </div>
        <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
          <p className="text-xs text-text-muted">Timeline chart — requires content calendar publish dates + GA4 page-level first-session data</p>
        </div>
      </SectionCard>

      {/* ── Section D: Net-New vs Optimized Content Lift ── */}
      <SectionCard
        title="Net-New vs Optimized Content Lift"
        description="Compares performance lift for net-new content publications versus pages that were optimized (updated, expanded, or restructured). Helps determine where content investment has the highest ROI."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {['Net-New Content', 'Optimized Content'].map((type) => (
            <div key={type} className="flex flex-col gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="text-xs font-bold text-white/60">{type}</p>
              <div className="flex flex-col gap-2">
                {['Avg Sessions (30d)', 'AI Citation Rate', 'AI-Referred Sessions', 'Time to First AI Activity'].map(m => (
                  <div key={m} className="flex items-center justify-between text-xs">
                    <span className="text-text-muted">{m}</span>
                    <span className="tabular-nums text-white/20">—</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
          <p className="text-xs text-text-muted">Grouped bar chart — requires content action classification from content calendar</p>
        </div>
      </SectionCard>

      {/* ── Section E: Decay vs Compounding Content ── */}
      <SectionCard
        title="Decay vs Compounding Content"
        description="Classifies owned content into decay (traffic declining month-over-month) vs compounding (traffic accelerating). Compounding content with AI citation activity represents the highest-value assets to protect and scale."
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[
            { label: 'Compounding URLs',       color: '#60FF80', desc: 'Traffic accelerating + AI cited' },
            { label: 'Stable URLs',            color: '#FFFC60', desc: 'Flat traffic, some AI activity' },
            { label: 'Decaying URLs',          color: '#FF4444', desc: 'Declining traffic, low AI citation' },
            { label: 'High AI / Low Traffic',  color: '#60FDFF', desc: 'AI-cited but no human traffic yet' },
            { label: 'High Traffic / No AI',   color: '#39A0FF', desc: 'Popular but not AI-indexed' },
            { label: 'No Activity',            color: '#8A8A8A', desc: 'Neither traffic nor AI citations' },
          ].map(({ label, color, desc }) => (
            <div key={label} className="flex flex-col gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[11px] font-semibold text-white/60">{label}</span>
              </div>
              <span className="text-lg font-bold text-white/20">—</span>
              <span className="text-[10px] text-text-muted">{desc}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── Section F: Owned Content Cited in AI ── */}
      <SectionCard
        title="Owned Content Cited in AI"
        description="Your owned URLs that appear in AI-generated responses. Ranked by citation frequency. Identifies which owned assets are earning LLM retrieval and which are invisible to AI tools."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <Th>#</Th>
                <Th>URL</Th>
                <Th>Content Type</Th>
                <Th>AI Citations</Th>
                <Th>AI-Referred Sessions</Th>
                <Th># LLMs Citing</Th>
                <Th>GA4 Sessions (30d)</Th>
                <Th>Prompt Clusters</Th>
              </tr>
            </thead>
            <tbody>
              <EmptyBody cols={8} message="Connect GA4 + Peec AI URL-level citation data to populate owned content ranking" />
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── Section G: Content Gaps ── */}
      <div className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-bg-surface p-6">
        <div>
          <h3 className="text-sm font-bold text-white">Content Gaps</h3>
          <p className="mt-1 text-xs text-text-muted">
            Three views of content gap: human-visible pages AI ignores, AI-cited pages humans don't visit, and pages AI bots crawl without citing.
          </p>
        </div>

        {/* Tab 1: Traffic No AI */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#39A0FF]/10 text-[10px] font-bold text-[#39A0FF]">1</span>
            <span className="text-xs font-bold text-white/70">Traffic — No AI Citation</span>
          </div>
          <p className="text-[11px] text-text-muted">High-traffic owned pages that are not being cited by any AI tool. These have proven human value but haven't earned LLM visibility — priority AEO optimization candidates.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <Th>URL</Th>
                  <Th>Sessions (30d)</Th>
                  <Th>AI Citations</Th>
                  <Th>Content Type</Th>
                  <Th>Last Updated</Th>
                  <Th>AEO Fix Priority</Th>
                </tr>
              </thead>
              <tbody>
                <EmptyBody cols={6} message="Requires GA4 page sessions + Peec AI owned-domain citation data" />
              </tbody>
            </table>
          </div>
        </div>

        <div className="border-t border-white/[0.06]" />

        {/* Tab 2: AI No Traffic */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#60FF80]/10 text-[10px] font-bold text-[#60FF80]">2</span>
            <span className="text-xs font-bold text-white/70">AI Citation — No Human Traffic</span>
          </div>
          <p className="text-[11px] text-text-muted">Owned pages that AI tools are citing frequently but that are not driving measurable GA4 sessions. High AI citation with no human follow-through indicates a CTA or UX conversion gap.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <Th>URL</Th>
                  <Th>AI Citations</Th>
                  <Th>AI-Referred Sessions</Th>
                  <Th>Organic Sessions (30d)</Th>
                  <Th>Content Type</Th>
                  <Th>Recommended Action</Th>
                </tr>
              </thead>
              <tbody>
                <EmptyBody cols={6} message="Requires GA4 + Peec AI URL-level citation data" />
              </tbody>
            </table>
          </div>
        </div>

        <div className="border-t border-white/[0.06]" />

        {/* Tab 3: Bot Crawled No Citations */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#FFFC60]/10 text-[10px] font-bold text-[#FFFC60]">3</span>
            <span className="text-xs font-bold text-white/70">AI Bot Crawled — No Citations</span>
          </div>
          <p className="text-[11px] text-text-muted">Pages that AI crawlers are actively visiting but not citing in responses. Crawl without citation signals a content quality or format issue — the page is accessible but not LLM-extractable.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <Th>URL</Th>
                  <Th>AI Bot Visits</Th>
                  <Th>AI Citations</Th>
                  <Th>Bots Crawling</Th>
                  <Th>Last Crawled</Th>
                  <Th>Format Issue Hypothesis</Th>
                </tr>
              </thead>
              <tbody>
                <EmptyBody cols={6} message="Requires server-side AI bot log analysis (GPTBot, ClaudeBot, PerplexityBot)" />
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Section H: Competitor / Third-Party Content ── */}
      <SectionCard
        title="Competitor / Third-Party Content Cited for Your Target Prompts"
        description="Non-owned content — competitor pages, editorial articles, third-party directories — that AI tools are citing in response to prompts where Avenue Z should appear. Understanding what is winning informs what to create or outreach to."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <Th>URL</Th>
                <Th>Domain</Th>
                <Th>Domain Type</Th>
                <Th># Prompt Matches</Th>
                <Th>Retrieved %</Th>
                <Th>Citation Rate</Th>
                <Th>Brand Mentioned</Th>
                <Th>Competitor Brands</Th>
              </tr>
            </thead>
            <tbody>
              <EmptyBody cols={8} message="Requires URL-level citation data from Peec AI Pro" />
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── Section I: AI Systems Interacting with Our Content ── */}
      <SectionCard
        title="AI Systems Interacting with Our Content"
        description="Which AI crawlers are actively indexing owned content, at what frequency, and which pages they visit most. Identifies crawl waste, blocked bots, and coverage gaps across LLM training pipelines."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {['GPTBot', 'ClaudeBot', 'PerplexityBot', 'GoogleBot-AI', 'CCBot', 'Applebot'].map((bot) => (
            <div key={bot} className="flex flex-col gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex items-center gap-1.5">
                <Globe2 className="h-3.5 w-3.5 text-text-muted" />
                <span className="text-[11px] font-bold text-white/50">{bot}</span>
              </div>
              <span className="text-sm font-bold text-white/20">—</span>
              <span className="text-[10px] text-text-muted">visits · pending</span>
            </div>
          ))}
        </div>
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
          <div className="text-center">
            <Search className="mx-auto mb-2 h-5 w-5 text-text-muted/40" />
            <p className="text-xs text-text-muted">AI bot crawl volume chart — requires server access log parsing</p>
          </div>
        </div>
      </SectionCard>

      {/* ── Section J: Recommended Actions ── */}
      <div className="rounded-xl border border-[#60FDFF]/20 bg-[#60FDFF]/[0.03] p-6">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#60FDFF]" />
          <span className="text-sm font-bold text-white">What the Content Team Should Do Next</span>
        </div>
        <p className="mb-5 text-sm leading-relaxed text-white/60">
          Prioritized content actions are ranked by estimated AI visibility lift. Connect content calendar and GA4 to generate specific URL-level recommendations. Below is the framework the recommendation engine uses.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: 'Fill AI-Invisible Gaps',
              color: '#60FF80',
              weight: '35%',
              body: 'Create content for prompt clusters where owned URLs have 0 AI citations. FAQ and numbered-list formats earn the highest citation rate.',
            },
            {
              label: 'Optimize High-Traffic / No-AI Pages',
              color: '#39A0FF',
              weight: '25%',
              body: 'Add schema markup, FAQ sections, and definition blocks to proven high-traffic pages that AI tools are not yet citing.',
            },
            {
              label: 'Capitalize on Compounding Assets',
              color: '#FFFC60',
              weight: '20%',
              body: 'Expand and internally link to owned pages that are already compounding — adding depth protects them from competitor displacement.',
            },
            {
              label: 'Refresh Decaying Owned Content',
              color: '#FF4444',
              weight: '20%',
              body: 'Update publication dates, expand word count, and improve structured data on decaying pages before AI tools stop crawling them.',
            },
          ].map(({ label, color, weight, body }) => (
            <div key={label} className="flex flex-col gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="flex items-center justify-between">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[10px] font-bold text-white/30">{weight}</span>
              </div>
              <p className="text-xs font-bold text-white/80">{label}</p>
              <p className="text-[11px] leading-relaxed text-text-muted">{body}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[10px] text-text-muted">
          Opportunity Score = 30% human performance + 25% AI citation gap + 20% competitor pressure + 15% AI bot attention + 10% freshness
        </p>
      </div>

      <p className="text-xs text-text-muted">
        Content Impact Tracker · Requires: content calendar (CSV/Notion), GA4 page-level sessions, Peec AI URL-level citation data, server access logs for AI bot analysis
      </p>
    </div>
  )
}
