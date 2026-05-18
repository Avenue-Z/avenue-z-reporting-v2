import Image from 'next/image'

interface HeaderProps {
  title: string
  subtitle?: string
  logoUrl?: string
  children?: React.ReactNode
}

export function Header({ title, subtitle, logoUrl, children }: HeaderProps) {
  const isWhiteLogo = logoUrl?.includes('AvenueZ_White')

  return (
    <div className="mb-8 flex items-end justify-between">
      <div className="flex items-center gap-4">
        {logoUrl && (
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg overflow-hidden ${
              isWhiteLogo ? 'bg-black p-1.5' : ''
            }`}
          >
            <Image
              src={logoUrl}
              alt=""
              width={40}
              height={40}
              className={isWhiteLogo ? 'h-7 w-7 object-contain' : 'h-10 w-10 object-cover rounded-lg'}
            />
          </span>
        )}
        <div>
          {subtitle && (
            <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
              {subtitle}
            </p>
          )}
          <h1 className="text-4xl font-extrabold uppercase text-white">
            {title}
          </h1>
        </div>
      </div>
      {children && <div className="flex items-center gap-3">{children}</div>}
    </div>
  )
}
