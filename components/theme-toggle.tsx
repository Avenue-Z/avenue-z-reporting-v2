'use client'

import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'

const STORAGE_KEY = 'az-theme'

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as 'dark' | 'light' | null
    const current =
      stored ??
      (document.documentElement.getAttribute('data-theme') as 'dark' | 'light' | null) ??
      'dark'
    applyTheme(current)
    setTheme(current)
    setMounted(true)
  }, [])

  function applyTheme(t: 'dark' | 'light') {
    if (t === 'light') {
      document.documentElement.setAttribute('data-theme', 'light')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
    localStorage.setItem(STORAGE_KEY, t)
  }

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
  }

  if (!mounted) return <div className="p-2 w-9 h-9" />

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className="p-2 rounded-md text-text-muted hover:text-white hover:bg-white/[0.04] transition-colors"
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
