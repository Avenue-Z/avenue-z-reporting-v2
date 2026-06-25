export interface LinkedInCreativeMetrics {
  spend: number
  impressions: number
  clicks: number
  ctr: number
  cpc: number
  leads: number
  costPerLead: number
  leadFormOpens: number
  leadFormCompletionRate: number
  landingPageClicks: number
  shareOfSpend: number
}

export interface LinkedInCreativeRow extends LinkedInCreativeMetrics {
  ad: string            // creativeDscName
  campaign: string      // campaignName
  campaignGroup: string // campaignGroupName
  status: string
}

// Tree: Campaign Group → Campaign → Ad (mirrors Meta's Campaign → Ad Set → Ad).
export interface LinkedInCampaignNode extends LinkedInCreativeMetrics {
  name: string // campaignName
  ads: LinkedInCreativeRow[]
}

export interface LinkedInCampaignGroupNode extends LinkedInCreativeMetrics {
  name: string // campaignGroupName
  campaigns: LinkedInCampaignNode[]
}

export interface LinkedInGeoRow {
  region: string
  spend: number
  impressions: number
  clicks: number
  leads: number
}
