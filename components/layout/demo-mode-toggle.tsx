'use client'

import { useTransition } from 'react'
import { Sparkles } from 'lucide-react'
import { setDemoMode } from '@/app/actions/demo-mode'
import { cn } from '@/lib/utils'

interface Props {
  /** Whether demo mode is currently effective for this user/page. */
  enabled: boolean
  /** When true, render only the icon (collapsed sidebar mode). */
  collapsed?: boolean
}

/**
 * Sidebar control that lets a demo-flagged user temporarily turn demo
 * content off (and back on). Sits just above the user-profile button
 * in the sidebar footer. Only rendered for users where
 * `session.user.demoMode === true` (per the sidebar's parent).
 */
export function DemoModeToggle({ enabled, collapsed = false }: Props) {
  const [pending, startTransition] = useTransition()

  const onToggle = () => {
    startTransition(async () => {
      await setDemoMode(enabled ? 'off' : 'on')
    })
  }

  if (collapsed) {
    return (
      <button
        onClick={onToggle}
        disabled={pending}
        title={enabled ? 'Demo mode is on — click to turn off' : 'Demo mode is off — click to turn on'}
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-md transition-colors',
          enabled
            ? 'bg-[#FFD060]/15 text-[#FFD060] hover:bg-[#FFD060]/25'
            : 'text-text-muted hover:bg-white/[0.06] hover:text-white',
          pending && 'opacity-50',
        )}
      >
        <Sparkles className="h-4 w-4" />
      </button>
    )
  }

  return (
    <button
      onClick={onToggle}
      disabled={pending}
      title={enabled ? 'Demo mode is on — click to turn off' : 'Demo mode is off — click to turn on'}
      className={cn(
        'group flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors',
        enabled
          ? 'border-[#FFD060]/30 bg-[#FFD060]/10 hover:bg-[#FFD060]/15'
          : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06]',
        pending && 'opacity-50',
      )}
    >
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
          enabled ? 'bg-[#FFD060]/20 text-[#FFD060]' : 'bg-white/[0.04] text-text-muted',
        )}
      >
        <Sparkles className="h-3.5 w-3.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn('text-[11px] font-bold uppercase tracking-widest', enabled ? 'text-[#FFD060]' : 'text-text-muted')}>
          Demo mode
        </span>
        <span className="truncate text-[10px] text-text-muted">
          {pending ? 'Switching…' : enabled ? 'Showing sample data' : 'Showing real data'}
        </span>
      </span>
      <span
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
          enabled ? 'bg-[#FFD060]' : 'bg-white/[0.1]',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
            enabled ? 'translate-x-4' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  )
}
