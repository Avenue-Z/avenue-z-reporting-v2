import { SmQueryError, SmTimeoutError } from '@/lib/supermetrics/types'
import { TwQueryError, TwRateLimitError } from '@/lib/triplewhale/client'
import { ShopifyQlError } from '@/lib/shopify/client'
import type { BlockError } from './types'

/** Missing/invalid credentials or client config for the source. */
export class DisconnectedError extends Error {}
/** Query succeeded but returned no rows for the range. */
export class NoDataError extends Error {}
/** Returned data fell outside the binding's confirmed scope (account drift). */
export class DriftError extends Error {}
/** Binding-level invalidity caught before fetch: unsafe dimension, missing
 *  granularity, unknown DS for series, etc. */
export class InvalidMetricError extends Error {}

/** Highest-priority first. */
export const ERROR_PRECEDENCE: BlockError[] = [
  'disconnected',
  'invalid-metric',
  'rate-limited',
  'no-data',
  'error',
]

export function mapError(e: unknown): BlockError {
  if (e instanceof DisconnectedError) return 'disconnected'
  if (e instanceof InvalidMetricError) return 'invalid-metric'
  if (e instanceof DriftError) return 'invalid-metric'
  if (e instanceof NoDataError) return 'no-data'
  if (e instanceof SmTimeoutError) return 'rate-limited'
  if (e instanceof SmQueryError) return 'invalid-metric'
  if (e instanceof TwRateLimitError) return 'rate-limited'
  if (e instanceof TwQueryError) return 'invalid-metric'
  if (e instanceof ShopifyQlError) return 'invalid-metric'
  return 'error'
}

/** Returns whichever error has higher precedence (used to combine aggregate operand failures). */
export function worseError(a: BlockError, b: BlockError): BlockError {
  return ERROR_PRECEDENCE.indexOf(a) <= ERROR_PRECEDENCE.indexOf(b) ? a : b
}
