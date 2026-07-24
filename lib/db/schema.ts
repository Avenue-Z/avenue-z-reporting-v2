import { pgTable, uuid, text, jsonb, timestamp, pgEnum, index, integer, unique, boolean, date, check, bigint } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import type { DashboardConfig } from '@/lib/dashboard/types'
import type { SectionTemplate, ReportSectionConfig } from '@/lib/report-sections/types'

// --- Domain types preserved from the deleted clients.config.ts ---

export type ReportSlug =
  | 'exec-summary'
  | 'ga4'
  | 'meta-ads'
  | 'google-ads'
  | 'email-marketing'
  | 'blended-performance'
  | 'linkedin-ads'
  | 'paid-media'
  | 'organic-social'
  | 'snapchat-ads'
  | 'tiktok-ads'
  | 'shopify-performance'
  | 'hubspot-performance'
  | 'inbound-funnel'
  | 'reddit-ads'
  | 'bing-ads'
  | 'ffci'
  | 'tiktok-shop'
  | 'pr-placements'
  | 'google-search-console'
  | 'salesforce'
  | 'gohighlevel'
  | 'ticket-sales'
  | 'peec-ai'
  | 'profound-ai'
  | 'demand-overview'
  | 'ai-summaries'
  | 'report-generator'
  | 'request-a-report'

export interface PRConfig {
  keywords: string[]
  excludeKeywords?: string[]
  sourceLocationUri?: string[]
  language?: string
  dataTypes?: ('news' | 'pr' | 'blog')[]
  lookbackDays?: number
}

export type LeadCategory = 'employer' | 'broker' | 'contact'

export interface PaidSearchConfig {
  /** Google Ads account id, digits only, e.g. '4136001852'. */
  googleAdsAccountId: string
  /** Canonical conversion actions. Category is NOT name-derivable, so it is explicit. */
  leadActions: Array<{ name: string; category: LeadCategory }>
}

export interface MetaConfig {
  /** Meta ad account id incl. the act_ prefix, e.g. 'act_1480350426850960'. */
  metaAdAccountId: string
}

export interface LinkedInConfig {
  /** LinkedIn ad account id, digits only, e.g. '503368877'. */
  linkedinAdAccountId: string
}

export interface DashSocialConfig {
  /** Dash Social brand id (digits), e.g. 24350. Selects the brand for the shared DASH_API_TOKEN. */
  brandId: number
  /** Optional channel allowlist (lowercase 'instagram','facebook','twitter'); defaults to all reportable channels. */
  channels?: string[]
}

/**
 * Per-client column layout for the PR Proof Library Google Sheet.
 *
 * Each value is the sheet column letter ("A", "B", "C", …). The parser
 * looks up cell values by column letter at runtime, so each client can
 * have a differently-structured sheet.
 *
 * - `client` is optional. When omitted, the parser does not filter by
 *   client name — useful for client-dedicated sheets (one client per file).
 * - `link` is required because rows without a link are treated as
 *   incomplete entries and skipped.
 * - Other fields are optional; missing fields render as empty strings.
 *
 * When the client row has no `prProofColumnMap` set, the parser falls back
 * to the legacy A–G layout (Client | Outlet | Headline | Publication Date
 * | Link | Impact | Date Added).
 */
export interface PRProofColumnMap {
  /**
   * Name of the worksheet tab holding the data. Optional — defaults to
   * "Master Library", and falls back to the first tab when neither is present.
   * Set this when a client's PR Proof sheet names its data tab differently, so
   * the reader targets it by name instead of by position.
   */
  tab?:             string
  client?:          string
  outlet?:          string
  headline?:        string
  publicationDate?: string
  link:             string
  impact?:          string
  dateAdded?:       string
}

// --- Drizzle schema ---

export const clientRoleEnum = pgEnum('client_role', [
  'INTERNAL_ADMIN',
  'INTERNAL_ANALYST',
  'CLIENT_ADMIN',
  'CLIENT_VIEWER',
])

export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  logoUrl: text('logo_url'),
  domain: text('domain'),
  ga4PropertyId: text('ga4_property_id'),
  gscSiteUrl: text('gsc_site_url'),
  hubspotTokenEnvVar: text('hubspot_token_env_var'),
  sfCsvFileId: text('sf_csv_file_id'),
  sfPrevCsvFileId: text('sf_prev_csv_file_id'),
  sitebulbSheetId: text('sitebulb_sheet_id'),
  peecCustomerProjectId: text('peec_customer_project_id'),
  prProofSheetId: text('pr_proof_sheet_id'),
  prProofColumnMap: jsonb('pr_proof_column_map').$type<PRProofColumnMap>(),
  contentCalendarSheetId: text('content_calendar_sheet_id'),
  peecYourBrand: text('peec_your_brand'),
  profoundCategoryId: text('profound_category_id'),
  prConfig: jsonb('pr_config').$type<PRConfig>(),
  smApiKeyEnvVar: text('sm_api_key_env_var'),
  paidSearchConfig: jsonb('paid_search_config').$type<PaidSearchConfig>(),
  metaConfig: jsonb('meta_config').$type<MetaConfig>(),
  linkedinConfig: jsonb('linkedin_config').$type<LinkedInConfig>(),
  dashSocialConfig: jsonb('dash_social_config').$type<DashSocialConfig>(),
  enabledReports: text('enabled_reports').array().notNull().$type<ReportSlug[]>(),
  hiddenReports: text('hidden_reports').array().notNull().default([]).$type<ReportSlug[]>(),
  sharedPasswordHash: text('shared_password_hash'),
  maxSeats: integer('max_seats').notNull().default(5),
  triplewhaleShopId: text('triplewhale_shop_id'),
  // A reporting-only host (created via self-service "Add new report") — has a
  // configurable dashboard but is not a real client, so it's hidden from the
  // /dashboard client lists (see getVisibleClients). Real clients stay false.
  dashboardOnly: boolean('dashboard_only').notNull().default(false),
  dashboardConfig: jsonb('dashboard_config').$type<DashboardConfig>(),
  reportSectionConfig: jsonb('report_section_config').$type<ReportSectionConfig>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// TODO(remove-demo-mode): the demo_mode column is intentionally left in the
// database for now. Drop it via a Drizzle migration in a follow-up. See
// MIGRATIONS-PENDING.md.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  role: clientRoleEnum('role').notNull(),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  clientIdIdx: index('users_client_id_idx').on(table.clientId),
}))

// Last-known health status per (surface:clientSlug:section). Written by the
// health sweep; only status *changes* are announced to Slack.
export const healthState = pgTable('health_state', {
  key: text('key').primaryKey(),
  status: text('status').notNull().$type<'ok' | 'down'>(),
  detail: text('detail'),
  since: timestamp('since', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// --- Relations (enables nested queries) ---

export const clientsRelations = relations(clients, ({ many }) => ({
  users: many(users),
}))

export const usersRelations = relations(users, ({ one }) => ({
  client: one(clients, {
    fields: [users.clientId],
    references: [clients.id],
  }),
}))

// --- Inferred TS types for consumers ---

// Cache of discovered Supermetrics dimension values (for the dashboard block builder).
export const smDimensionValueCache = pgTable('sm_dimension_value_cache', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientSlug: text('client_slug').notNull(),
  dsId: text('ds_id').notNull(),
  account: text('account').notNull(),
  column: text('column').notNull(),
  values: jsonb('values').$type<string[]>().notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique('sm_dim_cache_key').on(t.clientSlug, t.dsId, t.account, t.column)])

export type SmDimensionValueCacheRow = typeof smDimensionValueCache.$inferSelect

// Public, tokened read-only share of a client's configurable dashboard. One row per
// client (clientSlug unique) — a single shareable link per client for now. The token
// is the bearer credential for the public /share/[token] view; block_ids is the subset
// of blocks the sharer chose to expose; expires_at null = never.
export const dashboardShares = pgTable('dashboard_shares', {
  id: uuid('id').primaryKey().defaultRandom(),
  token: text('token').notNull().unique(),
  clientSlug: text('client_slug').notNull().unique(),
  title: text('title').notNull(),
  blockIds: jsonb('block_ids').$type<string[]>().notNull(),
  access: text('access').notNull().default('link'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type DashboardShareRow = typeof dashboardShares.$inferSelect

// Per-section canonical composition: the ordered list of parts + labels + thresholds
// that define a section's default layout. The seed inserts one row per section slug;
// consumers fall back to the hardcoded code default when no row exists.
export const sectionTemplates = pgTable('section_templates', {
  sectionSlug: text('section_slug').primaryKey(),
  composition: jsonb('composition').$type<SectionTemplate>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by'),
  promotedFrom: text('promoted_from'),
})

export type SectionTemplateRow = typeof sectionTemplates.$inferSelect

export const commentaryStatusEnum = pgEnum('commentary_status', ['draft', 'approved'])

// One row per commentary entry. Many entries per (client, viewKey) form the
// history stream shown in the older-entries dropdown. viewKey is a canonical
// key from lib/commentary/views.ts (e.g. 'peec-ai', 'meta-ads'), NOT a raw route
// slug. body_html is sanitized on write. period_* is the commentary's OWN range,
// independent of the dashboard date picker.
export const reportCommentary = pgTable('report_commentary', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  viewKey: text('view_key').notNull(),
  bodyHtml: text('body_html').notNull(),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  status: commentaryStatusEnum('status').notNull().default('draft'),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
  approvedBy: text('approved_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  // Soft delete. Deleted rows are hidden from every view but never removed: the
  // approver history log still shows them, and a deleted draft stays recallable
  // at the DB level. Only drafts are deletable (see canDeleteDraft), enforced below.
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: text('deleted_by'),
}, (table) => ({
  clientViewIdx: index('report_commentary_client_view_idx').on(table.clientId, table.viewKey),
  // The "only drafts are deletable" rule is an application invariant (canDeleteDraft).
  // Enforce it in the DB too, so a future caller cannot produce an approved+deleted row
  // — a state the history log has no way to describe.
  noDeletedApproved: check(
    'report_commentary_no_deleted_approved',
    sql`${table.deletedAt} IS NULL OR ${table.status} = 'draft'`,
  ),
}))

export const postDesignationEnum = pgEnum('post_designation', ['organic', 'influencer'])

// One row per (client, Dash post id). Absence = never manually designated (lets the
// #ad suggestion apply); a stored row always wins, including a stored 'organic' that
// overrides an #ad suggestion. post_id is Dash's own id — stable and unique in the
// CONTENT payload. Mirrors report_commentary's shape/indexing.
export const postDesignations = pgTable('post_designations', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  postId: bigint('post_id', { mode: 'number' }).notNull(),
  designation: postDesignationEnum('designation').notNull(),
  setBy: text('set_by').notNull(),          // email
  setAt: timestamp('set_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  clientPostUnique: unique('post_designations_client_post_key').on(table.clientId, table.postId),
  clientIdx: index('post_designations_client_idx').on(table.clientId),
}))

export type PostDesignation = typeof postDesignations.$inferSelect
export type NewPostDesignation = typeof postDesignations.$inferInsert

export type Client = typeof clients.$inferSelect
export type NewClient = typeof clients.$inferInsert
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type ClientRole = (typeof clientRoleEnum.enumValues)[number]
export type HealthStateRow = typeof healthState.$inferSelect
export type ReportCommentary = typeof reportCommentary.$inferSelect
export type NewReportCommentary = typeof reportCommentary.$inferInsert
