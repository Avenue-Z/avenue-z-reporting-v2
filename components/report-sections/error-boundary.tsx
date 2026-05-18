'use client'

import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  sectionName?: string
}

interface State {
  hasError: boolean
  error?: Error
}

export class ReportErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6">
          <p className="text-sm font-bold text-[#FF4444]">
            Failed to load {this.props.sectionName ?? 'this section'}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
        </div>
      )
    }

    return this.props.children
  }
}
