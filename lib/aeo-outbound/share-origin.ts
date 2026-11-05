// Server only (spec v1.1 §16.2): the origin every public link uses on this deployment. VERCEL_TARGET_ENV names the
// system or custom environment (Vercel docs, read 2026-10-12); the domains were read from the Vercel project the same
// day. Anywhere else (a preview, local dev) there is no locked origin and the page's own is used, labelled as a test link.
export const SHARE_ORIGINS = { production: 'https://reporting.avenuez.com', staging: 'https://staging.reporting.avenuez.com' } as const

export function shareOrigin(targetEnv: string | undefined = process.env.VERCEL_TARGET_ENV): string | null {
  if (targetEnv === 'production') return SHARE_ORIGINS.production
  if (targetEnv === 'staging') return SHARE_ORIGINS.staging
  return null
}
