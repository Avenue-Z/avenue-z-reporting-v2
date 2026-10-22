// Synthetic (spec v1.1 §19.10). Shaped like the 2026-10-14 live dev run: five brands, one far ahead, a brand at 0
// visibility, one own site at the top of the domains, an institutional-heavy source mix and four competitor domain
// gaps. Every name and domain is made up; no prospect's data.
import type { PeecPull } from '../pull'

const own = { id: 'kw_own', name: 'Example Senior Living', is_own: true, domains: ['www.examplesenior.com'] }
const roster = [
  own,
  { id: 'kw_lead', name: 'Carefinder', is_own: false, domains: ['carefinder.example'] },
  { id: 'kw_run', name: 'Caringly', is_own: false, domains: ['www.caringly.example'] },
  { id: 'kw_way', name: 'Seniorway', is_own: false, domains: ['www.seniorway.example'] },
  { id: 'kw_pet', name: 'Petalcare', is_own: false, domains: ['petalcare.example'] },
]
const row = (domain: string, classification: string, chats: number, retrievals: number, mentioned: string[], pct?: number) =>
  ({ domain, classification, retrieved_chat_count: chats, retrieval_count: retrievals, usage_rate: retrievals, mentioned_brands: mentioned.map((id) => ({ id })), ...(pct !== undefined ? { retrieved_percentage: pct } : {}) })

export const LIVE_SHAPE_PULL: PeecPull = {
  project: { id: 'or_synthetic', name: 'Example Senior Living (PITCH)', status: 'PITCH_ENDED' },
  roster,
  ownBrand: own,
  profile: { industry: 'Senior Care Referral Services', markets: ['United States'] },
  requested: { start: '2026-09-20', end: '2026-09-26' },
  rangePicked: true,
  window: { start: '2026-09-20', end: '2026-09-21' },
  pulledDay: '2026-09-22',
  brands: [
    { brand: { id: 'kw_lead', name: 'Carefinder' }, visibility: 0.977818853974122, share_of_voice: 0.9976087996174079, position: 1.0782122905027933 },
    { brand: { id: 'kw_run', name: 'Caringly' }, visibility: 0.012939001848428836, share_of_voice: 0.001275306870715766, position: 1.8571428571428572 },
    { brand: { id: 'kw_own', name: 'Example Senior Living' }, visibility: 0.011090573012939002, share_of_voice: 0.0009564801530368245, position: 2.1666666666666665 },
    { brand: { id: 'kw_way', name: 'Seniorway' }, visibility: 0.0018484288354898336, share_of_voice: 0.00015941335883947074, position: 2 },
    { brand: { id: 'kw_pet', name: 'Petalcare' }, visibility: 0, share_of_voice: 0 },
  ],
  domains: [
    row('examplesenior.com', 'OWN', 142, 165, ['kw_lead', 'kw_own', 'kw_run'], 0.26247689463955637),
    row('health-institute.gov', 'INSTITUTIONAL', 115, 630, ['kw_lead', 'kw_run']),
    row('videos.example', 'UGC', 102, 162, ['kw_lead', 'kw_own', 'kw_run']),
    row('medicare-info.gov', 'INSTITUTIONAL', 90, 715, ['kw_lead']),
    row('retiree-benefits.gov', 'INSTITUTIONAL', 60, 60, ['kw_lead']),
    row('seniornews.example', 'EDITORIAL', 55, 64, ['kw_lead', 'kw_run']),
    row('aging-agency.gov', 'INSTITUTIONAL', 50, 2141, ['kw_lead', 'kw_run']),
    row('corporate-site.example', 'CORPORATE', 40, 1259, []),
    row('encyclopedia.example', 'REFERENCE', 30, 282, []),
    row('forum.example', 'UGC', 20, 50, []),
    row('magazine.example', 'EDITORIAL', 15, 89, []),
    row('misc.example', 'OTHER', 10, 89, []),
    row('rival-landing.example', 'COMPETITOR', 5, 37, ['kw_lead']),
  ],
  promptCount: 104,
  models: ['Google AI Overview', 'Gemini UI', 'ChatGPT UI'],
  warnings: [],
}
