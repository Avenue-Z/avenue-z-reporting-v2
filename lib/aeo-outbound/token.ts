import { randomBytes } from 'node:crypto'

/** 144 random bits, URL-safe: the same recipe as dashboard share links (app/actions/dashboard.ts:258). */
export const newShareToken = (): string => randomBytes(18).toString('base64url')
export { isShareTokenShape } from './share-link'
