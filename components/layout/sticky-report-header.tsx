'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'

interface StickyReportHeaderProps {
  title: string
  subtitle?: string
  logoUrl?: string
  children?: React.ReactNode
}

export function StickyReportHeader({
  title,
  subtitle,
  logoUrl,
  children,
}: StickyReportHeaderProps) {
  const [scrolled, setScrolled] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return

    // Walk up the DOM to find the nearest overflow-y scroll container
    let scrollEl: HTMLElement | null = el.parentElement
    while (scrollEl && scrollEl !== document.body) {
      const { overflowY } = getComputedStyle(scrollEl)
      if (overflowY === 'auto' || overflowY === 'scroll') break
      scrollEl = scrollEl.parentElement
    }
    if (!scrollEl) return

    const onScroll = () => setScrolled(scrollEl!.scrollTop > 10)
    scrollEl.addEventListener('scroll', onScroll, { passive: true })
    return () => scrollEl!.removeEventListener('scroll', onScroll)
  }, [])

  const isWhiteLogo = logoUrl?.includes('AvenueZ_White')

  return (
    <div
      ref={wrapperRef}
      className={cn(
        'sticky top-0 z-30 -mx-8 -mt-8 px-8 transition-all duration-300',
        scrolled ? 'bg-black/60 backdrop-blur-md' : 'bg-black'
      )}
    >
      {/* Main row — shrinks vertically on scroll */}
      <div
        className={cn(
          'flex items-end gap-4 transition-all duration-300',
          scrolled ? 'pb-3 pt-3' : 'pb-5 pt-8'
        )}
      >
        {/* Left: logo + title — collapses when scrolled */}
        <div
          className={cn(
            'flex min-w-0 flex-1 items-center gap-4 overflow-hidden transition-all duration-300',
            scrolled ? 'max-h-0 opacity-0' : 'max-h-32 opacity-100'
          )}
        >
          {logoUrl && (
            <span
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg',
                isWhiteLogo ? 'bg-black p-1.5' : ''
              )}
            >
              <Image
                src={logoUrl}
                alt=""
                width={40}
                height={40}
                className={
                  isWhiteLogo
                    ? 'h-7 w-7 object-contain'
                    : 'h-10 w-10 rounded-lg object-cover'
                }
              />
            </span>
          )}
          <div>
            {subtitle && (
              <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
                {subtitle}
              </p>
            )}
            <h1 className="text-4xl font-extrabold uppercase text-white">{title}</h1>
          </div>
        </div>

        {/* Right: date picker / actions — always visible */}
        <div className="ml-auto flex shrink-0 items-center gap-3">
          {children}
        </div>
      </div>

      {/* Divider — fades out with the title */}
      <div
        className={cn(
          'divider-full transition-opacity duration-300',
          scrolled ? 'opacity-0' : 'opacity-100'
        )}
      />
    </div>
  )
}
