import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Avenue Z — Marketing Intelligence Platform',
    template: '%s | Avenue Z',
  },
  description: 'Multi-client marketing intelligence powered by Supermetrics.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  openGraph: {
    title: 'Avenue Z — Marketing Intelligence Platform',
    description: 'Multi-client marketing intelligence powered by Supermetrics.',
    siteName: 'Avenue Z Marketing Intelligence',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Avenue Z — Marketing Intelligence Platform',
    description: 'Multi-client marketing intelligence powered by Supermetrics.',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="bg-glow">{children}</body>
    </html>
  )
}
