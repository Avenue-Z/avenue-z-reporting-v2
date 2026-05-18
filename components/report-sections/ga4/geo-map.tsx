'use client'

import { useRef, useState } from 'react'
import { ComposableMap, Geographies, Geography, type GeoFeature } from 'react-simple-maps'
import { CHART_COLORS } from '@/lib/constants'

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'

// GA4 English country name → ISO 3166-1 numeric code
// (world-atlas TopoJSON uses numeric IDs as feature identifiers)
const COUNTRY_ISO: Record<string, number> = {
  'United States':          840,
  'United Kingdom':         826,
  'Canada':                 124,
  'Australia':               36,
  'Germany':                276,
  'France':                 250,
  'India':                  356,
  'Brazil':                  76,
  'Mexico':                 484,
  'Netherlands':            528,
  'Spain':                  724,
  'Italy':                  380,
  'Japan':                  392,
  'South Korea':            410,
  'China':                  156,
  'Singapore':              702,
  'Sweden':                 752,
  'Norway':                 578,
  'Denmark':                208,
  'Finland':                246,
  'Switzerland':            756,
  'Austria':                 40,
  'Belgium':                 56,
  'Poland':                 616,
  'Portugal':               620,
  'Ireland':                372,
  'Czechia':                203,
  'Czech Republic':         203,
  'Romania':                642,
  'Hungary':                348,
  'Greece':                 300,
  'Croatia':                191,
  'Slovakia':               703,
  'Bulgaria':               100,
  'Serbia':                 688,
  'Ukraine':                804,
  'Russia':                 643,
  'Turkey':                 792,
  'Israel':                 376,
  'Saudi Arabia':           682,
  'United Arab Emirates':   784,
  'South Africa':           710,
  'Nigeria':                566,
  'Kenya':                  404,
  'Egypt':                  818,
  'Morocco':                504,
  'Ghana':                  288,
  'Ethiopia':               231,
  'Tanzania':               834,
  'Algeria':                 12,
  'Tunisia':                788,
  'Argentina':               32,
  'Colombia':               170,
  'Chile':                  152,
  'Peru':                   604,
  'Venezuela':              862,
  'Ecuador':                218,
  'Bolivia':                 68,
  'Paraguay':               600,
  'Uruguay':                858,
  'Indonesia':              360,
  'Malaysia':               458,
  'Philippines':            608,
  'Thailand':               764,
  'Vietnam':                704,
  'Pakistan':               586,
  'Bangladesh':              50,
  'Sri Lanka':              144,
  'Nepal':                  524,
  'Myanmar':                104,
  'Cambodia':               116,
  'Taiwan':                 158,
  'Hong Kong':              344,
  'New Zealand':            554,
  'Slovenia':               705,
  'Lithuania':              440,
  'Latvia':                 428,
  'Estonia':                233,
  'Belarus':                112,
  'Moldova':                498,
  'Albania':                  8,
  'North Macedonia':        807,
  'Bosnia and Herzegovina':  70,
  'Montenegro':             499,
  'Kosovo':                 383,
  'Luxembourg':             442,
  'Malta':                  470,
  'Cyprus':                 196,
  'Iceland':                352,
  'Armenia':                 51,
  'Georgia':                268,
  'Azerbaijan':              31,
  'Kazakhstan':             398,
  'Uzbekistan':             860,
  'Qatar':                  634,
  'Kuwait':                 414,
  'Bahrain':                 48,
  'Oman':                   512,
  'Jordan':                 400,
  'Lebanon':                422,
  'Iraq':                   368,
  'Iran':                   364,
  'Afghanistan':              4,
  'Sudan':                  729,
  'Libya':                  434,
  'Angola':                  24,
  'Mozambique':             508,
  'Madagascar':             450,
  'Cameroon':               120,
  'Ivory Coast':            384,
  "Côte d'Ivoire":          384,
  'Uganda':                 800,
  'Zimbabwe':               716,
  'Zambia':                 894,
  'Senegal':                686,
  'Rwanda':                 646,
  'Panama':                 591,
  'Costa Rica':             188,
  'Guatemala':              320,
  'Honduras':               340,
  'El Salvador':            222,
  'Nicaragua':              558,
  'Dominican Republic':     214,
  'Puerto Rico':            630,
  'Jamaica':                388,
  'Cuba':                   192,
  'Trinidad and Tobago':    780,
}

export interface GeoCountry {
  name:           string
  sessions:       number
  engagementRate: number
}

interface GeoMapProps {
  countries: GeoCountry[]
}

function fmtPct(n: number) { return `${(n * 100).toFixed(1)}%` }

export function GeoMap({ countries }: GeoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{
    x: number
    y: number
    country: GeoCountry
  } | null>(null)

  // Build ISO numeric → country data lookup
  const isoToData: Record<number, GeoCountry> = {}
  for (const c of countries) {
    const iso = COUNTRY_ISO[c.name]
    if (iso) isoToData[iso] = c
  }

  const maxSessions = Math.max(...countries.map((c) => c.sessions), 1)

  const fillFor = (isoId: number): string => {
    const data = isoToData[isoId]
    if (!data) return 'rgba(255,255,255,0.06)'
    const intensity = data.sessions / maxSessions
    // Scale opacity: 0.18 at minimum presence → 0.90 at maximum
    const opacity = 0.18 + intensity * 0.72
    // Parse hex color and apply opacity via rgba
    const r = parseInt(CHART_COLORS.ga4.slice(1, 3), 16)
    const g = parseInt(CHART_COLORS.ga4.slice(3, 5), 16)
    const b = parseInt(CHART_COLORS.ga4.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${opacity})`
  }

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface px-6 py-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-white">Geographic Distribution</h3>
          <div className="group relative flex-shrink-0">
            <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">?</span>
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-64 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-xs leading-relaxed text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
              Sessions by country. Darker blue = more traffic. Hover any country to see session count and engagement rate.
              <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-muted">Low</span>
          {[0.18, 0.36, 0.54, 0.72, 0.90].map((op) => (
            <div
              key={op}
              className="h-2.5 w-5 rounded-sm"
              style={{ backgroundColor: CHART_COLORS.ga4, opacity: op }}
            />
          ))}
          <span className="text-[10px] text-text-muted">High</span>
        </div>
      </div>

      <div ref={containerRef} className="relative">
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ scale: 140, center: [10, 20] }}
          style={{ width: '100%', height: 'auto' }}
          width={960}
          height={500}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }: { geographies: GeoFeature[] }) =>
              geographies.map((geo: GeoFeature) => {
                const isoNum = Number(geo.id)
                const data   = isoToData[isoNum]

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={fillFor(isoNum)}
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth={0.5}
                    style={{
                      default:  { outline: 'none' },
                      hover:    { outline: 'none', fill: data ? CHART_COLORS.primary : 'rgba(255,255,255,0.12)', cursor: data ? 'pointer' : 'default' },
                      pressed:  { outline: 'none' },
                    }}
                    onMouseMove={(evt: React.MouseEvent<SVGPathElement>) => {
                      if (!data) return
                      const rect = containerRef.current?.getBoundingClientRect()
                      if (!rect) return
                      setTooltip({
                        x: evt.clientX - rect.left,
                        y: evt.clientY - rect.top,
                        country: data,
                      })
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                )
              })
            }
          </Geographies>
        </ComposableMap>

        {/* Floating tooltip */}
        {tooltip && (
          <div
            className="pointer-events-none absolute z-20 rounded-lg border border-white/[0.08] bg-[#1e1e1e] px-3 py-2.5 shadow-2xl"
            style={{
              left: tooltip.x + 12,
              top:  tooltip.y - 48,
              transform: tooltip.x > 600 ? 'translateX(-110%)' : undefined,
            }}
          >
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-text-muted">
              {tooltip.country.name}
            </p>
            <div className="flex items-baseline gap-3">
              <div>
                <p className="tabular-nums text-base font-bold text-white">
                  {tooltip.country.sessions.toLocaleString()}
                </p>
                <p className="text-[10px] text-text-muted">sessions</p>
              </div>
              <div className="h-6 w-px bg-white/10" />
              <div>
                <p className="tabular-nums text-base font-bold text-white">
                  {fmtPct(tooltip.country.engagementRate)}
                </p>
                <p className="text-[10px] text-text-muted">engagement</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Top countries ranked list below map */}
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5">
        {countries.slice(0, 5).map((c, i) => (
          <div key={c.name} className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-text-muted/60">{i + 1}</span>
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor: CHART_COLORS.ga4,
                opacity: 0.18 + (c.sessions / maxSessions) * 0.72,
              }}
            />
            <span className="text-xs text-white/70">{c.name}</span>
            <span className="tabular-nums text-xs font-semibold text-white">
              {c.sessions.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
