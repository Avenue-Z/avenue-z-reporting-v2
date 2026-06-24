export interface CreativeMetrics {
  spend: number
  impressions: number
  reach: number
  frequency: number
  linkClicks: number
  ctr: number
  cpc: number
  lpv: number
  costPerLpv: number
  engagements: number
  shareOfSpend: number
}

export interface CreativeRow extends CreativeMetrics {
  ad: string
  campaign: string
  adSet: string
  status: string
}

export interface AdSetNode extends CreativeMetrics {
  name: string
  ads: CreativeRow[]
}

export interface CampaignNode extends CreativeMetrics {
  name: string
  adSets: AdSetNode[]
}

export interface MetaGeoRow {
  region: string
  spend: number
  linkClicks: number
  lpv: number
  engagements: number
}
