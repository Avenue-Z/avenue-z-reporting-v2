import type { MetricFormat } from './types'

export function formatMetric(value: number, format: MetricFormat): string {
  switch (format) {
    case 'currency':
      return '$' + Math.round(value).toLocaleString('en-US')
    case 'percent':
      return value.toFixed(1) + '%'
    case 'count':
      return Math.round(value).toLocaleString('en-US')
    case 'number':
      return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
    case 'multiple':
      return value.toLocaleString('en-US', { maximumFractionDigits: 2 }) + 'x'
  }
}
