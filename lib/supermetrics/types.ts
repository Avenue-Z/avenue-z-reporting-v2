export class SmQueryError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'SmQueryError'
  }
}
export class SmTimeoutError extends Error {
  constructor(message = 'Supermetrics query timed out') {
    super(message)
    this.name = 'SmTimeoutError'
  }
}
export interface SmQueryParams {
  apiKey: string
  dsId: string
  dsAccounts: string
  fields: string[]
  dateRange: string // 'YYYY-MM-DD,YYYY-MM-DD'
  filters?: string
  settings?: Record<string, unknown>
  maxRows?: number
}
export interface SmResult {
  header: string[]
  rows: string[][]
}
