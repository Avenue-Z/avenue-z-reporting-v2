// A row stored before v1.1 (schema version 1), with the Data block and grounding flags v1.0 produced for it.
// Synthetic. Later tasks must keep these outputs for version 1 rows (spec v1.1 §10, round-2 MINOR 16).
import type { SnapshotData } from '../metrics'
import type { Slots } from '../slots'

const ALPHA = { id: 'kw_a', name: 'Alpha', isOwn: false, visibilityPct: 26.1, sovPct: 22.5, position: 2.4, rank: 1 }
const BETA = { id: 'kw_b', name: 'Beta', isOwn: false, visibilityPct: 18.5, sovPct: 16.9, position: 3.1, rank: 2 }
const OWN = { id: 'kw_own', name: 'Example Co', isOwn: true, visibilityPct: 15.1, sovPct: 15.9, position: 3.1, rank: 3 }

export const V1_DATA: SnapshotData = {
  projectId: 'or_fixture', projectName: 'Example pitch', brand: 'Example Co', generatedAt: '2026-10-08T15:00:00.000Z',
  window: { start: '2026-10-01', end: '2026-10-08' }, windowLabel: 'Oct 1, 2026 to Oct 8, 2026',
  category: 'Fintech', market: 'United States',
  brands: [ALPHA, BETA, OWN], own: OWN,
  kpis: [
    { label: 'AI visibility', value: '15.1%' }, { label: 'AI share of voice', value: '15.9%' },
    { label: 'Average answer position', value: '#3.1' }, { label: 'Competitive rank', value: '#3 of 3 brands' },
  ],
  competitorsTracked: 2, rankN: 3,
  leaderGaps: [{ name: 'Alpha', visibilityPoints: 11, sovPoints: 6.6 }, { name: 'Beta', visibilityPoints: 3.4, sovPoints: 1 }],
  ownDomains: ['example.com'], ownRetrievedChats: 1989, ownRetrievedPct: 22.4,
  sourceMix: [
    { label: 'Competitor', weight: 5902, pct: 53.7 }, { label: 'You', weight: 3698, pct: 33.6 },
    { label: 'Editorial', weight: 1000, pct: 9.1 }, { label: 'UGC', weight: 400, pct: 3.6 },
  ],
  gapDomains: [{ domain: 'forum.com', retrievedChats: 300 }],
  actions: [{ title: 'Give this page an H1 heading', impact: 'HIGH', type: 'SEO_ISSUE' }],
  promptCount: 100, models: ['ChatGPT UI', 'Google AI Overview'],
  notes: [
    'Rank is by visibility among the 3 brands tracked in Peec.',
    'Peec project or_fixture (PITCH). Window 2026-10-01 to 2026-10-08, all models: ChatGPT UI, Google AI Overview.',
  ],
}

export const V1_SLOTS: Slots = {
  category: 'Fintech', market: 'United States',
  headline: 'Example Co ranks #3 of 3 brands with 15.1% visibility',
  summary: 'Alpha leads with 26.1% visibility.',
  context: 'Alpha leads with 26.1% visibility and 22.5% share of voice, ahead of Example Co.',
  competitive_bullets: [{ lead: 'Own site:', text: 'Retrieved in 1,989 answers on example.com.' }, { lead: 'Position:', text: 'Average answer position is #3.1.' }],
  sources_bullets: [{ lead: 'Gap:', text: 'The gap to Alpha is 11 points.' }, { lead: 'Sites:', text: 'forum.com was used in 300 answers.' }],
  why: 'Visibility rose 42% on rival.io.',
  opportunities: [
    { signal: 'Peec recommends a heading fix', opportunity: 'Explore it', workstream: 'Technical AEO / SEO' },
    { signal: 'forum.com is used', opportunity: 'Investigate', workstream: 'PR / earned media' },
    { signal: 'Share of voice is 15.9%', opportunity: 'Test content', workstream: 'Content / AEO' },
  ],
  methodology: 'Peec data from Oct 1, 2026 to Oct 8, 2026 across 3 brands and 100 prompts. Results are directional.',
  next_step: 'A full AEO audit.',
}

export const V1_DATA_BLOCK = [
  'Brand: Example Co',
  'Category: Fintech',
  'Market: United States',
  'Data window: Oct 1, 2026 to Oct 8, 2026',
  'Key metrics: AI visibility 15.1%; AI share of voice 15.9%; Average answer position #3.1; Competitive rank #3 of 3 brands',
  'Competitors tracked in Peec: 2',
  'Brands in the comparison set: 3',
  'Brands by AI visibility (rank, name, visibility, share of voice): #1 Alpha 26.1% / 22.5%; #2 Beta 18.5% / 16.9%; #3 Example Co 15.1% / 15.9%',
  'Gap to each brand ranked above (visibility points, share of voice points): Alpha 11 points, 6.6 points; Beta 3.4 points, 1 points',
  'Own site retrievals (answers that retrieved example.com): 1,989, which is 22.4% of answers',
  'Source types by share of retrievals: Competitor 53.7%; You 33.6%; Editorial 9.1%; UGC 3.6%',
  'Competitor domain gaps (sites where competitors appear and the brand does not, by answers that used them): forum.com 300',
  'Current Peec recommended actions (title, impact): Give this page an H1 heading (high)',
  'Prompts tracked: 100',
  'AI models covered: ChatGPT UI, Google AI Overview',
].join('\n')

/** v1.0's flags for V1_SLOTS, in v1.0's "<top-level key>: <text>" form. */
export const V1_FLAGS = ['why: "rival.io" is not a domain in the Peec data', 'why: "42%" is not in the Peec data']
