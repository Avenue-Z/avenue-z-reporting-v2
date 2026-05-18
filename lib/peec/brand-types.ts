/** Manually inferred brand type mapping for Avenue Z's Peec.AI competitor set. */
export const BRAND_TYPE_MAP: Record<string, string> = {
  'Avenue Z':               'You',
  'iPullRank':              'SEO Agency',
  'First Page Sage':        'SEO Agency',
  'WebFX':                  'SEO Agency',
  'Siege Media':            'SEO Agency',
  'Single Grain':           'SEO Agency',
  'Intero Digital':         'SEO Agency',
  'Victorious':             'SEO Agency',
  'NP Digital':             'SEO Agency',
  'Ignite Visibility':      'SEO Agency',
  'GoFish Digital':         'SEO Agency',
  'Seer Interactive':       'SEO Agency',
  'SmartSites':             'SEO Agency',
  'Directive':              'SEO Agency',
  '51Blocks':               'SEO Agency',
  'RankScience':            'SEO Agency',
  'Black Propeller':        'SEO Agency',
  'Taktical Digital':       'SEO Agency',
  'OMNISCIENT':             'Content Agency',
  'MarketMuse':             'Content Agency',
  'OMNIUS':                 'Content Agency',
  'Edelman':                'PR & Communications',
  'Walker Sands':           'PR & Communications',
  'Prosek':                 'PR & Communications',
  'FTI Consulting':         'PR & Communications',
  'Gladstone Place Partners':'PR & Communications',
  'NoGood':                 'Growth Marketing',
  'SpicyMargarita':         'Growth Marketing',
}

export const BRAND_TYPE_COLORS: Record<string, string> = {
  'You':                '#60FDFF',
  'SEO Agency':         '#39A0FF',
  'PR & Communications':'#FF7A59',
  'Content Agency':     '#6034FF',
  'Growth Marketing':   '#FF6B8A',
  'Other':              '#8A8A8A',
}

export const BRAND_TYPE_DEFINITIONS: { type: string; desc: string }[] = [
  { type: 'You',                desc: 'Your own brand.' },
  { type: 'SEO Agency',         desc: 'Agencies primarily focused on search engine optimization.' },
  { type: 'PR & Communications',desc: 'Public relations and strategic communications firms.' },
  { type: 'Content Agency',     desc: 'Agencies specializing in content strategy and creation.' },
  { type: 'Growth Marketing',   desc: 'Performance and growth-focused marketing agencies.' },
  { type: 'Other',              desc: 'Brands not yet categorized.' },
]
