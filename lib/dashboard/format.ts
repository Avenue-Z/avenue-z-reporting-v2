import type { MetricFormat } from './types'

export function formatMetric(value: number, format: MetricFormat): string {
  switch (format) {
    case 'currency':
      return '$' + Math.round(value).toLocaleString('en-US')
    case 'percent':
      return value.toFixed(1) + '%'
    case 'count':
    case 'number':
      return Math.round(value).toLocaleString('en-US')
  }
}
