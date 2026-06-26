export const CLIENT_ROLES = ['CLIENT_ADMIN', 'CLIENT_VIEWER'] as const

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

// Deliberately simple: one @, non-empty local and domain, a dot in the domain.
export function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim())
}

export function isClientRole(role: string): boolean {
  return (CLIENT_ROLES as readonly string[]).includes(role)
}

export function seatsRemaining(currentCount: number, maxSeats: number): number {
  return Math.max(0, maxSeats - currentCount)
}

/** The login URL to hand an invited client-side user (admin or viewer). They sign
 *  in here with their email + their client's shared password. */
export function loginUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? ''
  return `${base}/login`
}
