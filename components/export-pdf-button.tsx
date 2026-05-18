'use client'

import { Download } from 'lucide-react'

export function ExportPdfButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-2 rounded-full bg-white text-black px-4 py-2 text-sm font-bold transition-opacity hover:opacity-80"
    >
      <Download className="h-4 w-4" />
      Export PDF
    </button>
  )
}
