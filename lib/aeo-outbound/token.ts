import { randomBytes } from 'node:crypto'

/** 144 random bits, URL-safe: the same recipe as dashboard share links (app/actions/dashboard.ts:258). */
export const newShareToken = (): string => randomBytes(18).toString('base64url')
export const isShareTokenShape = (t: string): boolean => /^[A-Za-z0-9_-]{24}$/.test(t)
