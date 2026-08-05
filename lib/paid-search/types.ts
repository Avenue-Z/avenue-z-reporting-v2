import type { LeadCategory } from '@/lib/db/schema'

export interface Kpi { key: string; label: string; value: number | string; prefix?: string; suffix?: string; delta?: number; invertDelta?: boolean; tooltip?: string; /** 'money' → render the numeric value as Paid Media cents ($1,234.50). Keeps value numeric so rollups can read it. */ format?: 'money' }
export interface HeroPoint { week: string; cost: number; clicks: number; impressions: number; leads: number }
export interface CampaignRow { campaign: string; cost: number; clicks: number; impressions: number; ctr: number; cpc: number; leads: number; cpl: number; convRate: number }
export interface LeadActionRow { name: string; category: LeadCategory; count: number }
export interface LeadBreakdown { byAction: LeadActionRow[]; categoryTotals: Record<LeadCategory, number>; trend: Array<{ bucket: string; leads: number }>; totalLeads: number }
export interface KeywordRow { keyword: string; matchType: string; clicks: number; impressions: number; ctr: number; cost: number; leads: number; cpl: number }
export interface GeoDma { dma: string; clicks: number; cost: number; leads: number }
export interface GeoRegion { region: string; clicks: number; cost: number; leads: number; dmas: GeoDma[] }
