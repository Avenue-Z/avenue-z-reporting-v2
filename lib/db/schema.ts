import { pgTable, uuid, text, jsonb, timestamp, pgEnum, index, boolean } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// --- Domain types preserved from the deleted clients.config.ts ---

export type ReportSlug =
  | 'exec-summary'
  | 'ga4'
  | 'meta-ads'
  | 'google-ads'
  | 'email-marketing'
  | 'blended-performance'
  | 'linkedin-ads'
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
  enabledReports: text('enabled_reports').array().notNull().$type<ReportSlug[]>(),
  hiddenReports: text('hidden_reports').array().notNull().default([]).$type<ReportSlug[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  role: clientRoleEnum('role').notNull(),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'cascade' }),
  // When true, the user automatically gets demoMode on every page they
  // view — empty/unconfigured sections fill with sample data and show a
  // "Sample data" badge. Used for sales-demo accounts (e.g. demo@avenuez.com).
  // The ?demo=1 URL flag works as an ad-hoc override for everyone else.
  demoMode: boolean('demo_mode').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  clientIdIdx: index('users_client_id_idx').on(table.clientId),
}))

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

export type Client = typeof clients.$inferSelect
export type NewClient = typeof clients.$inferInsert
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type ClientRole = (typeof clientRoleEnum.enumValues)[number]
