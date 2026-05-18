// Minimal ambient declaration for react-simple-maps v3.
// The package ships no TypeScript types and no @types package exists.
// Components and props are typed as needed; extend if more are required.

declare module 'react-simple-maps' {
  import type { CSSProperties, ReactNode } from 'react'

  interface ComposableMapProps {
    projection?: string
    projectionConfig?: Record<string, unknown>
    style?: CSSProperties
    width?: number
    height?: number
    children?: ReactNode
  }
  export function ComposableMap(props: ComposableMapProps): JSX.Element

  interface GeographiesProps {
    geography: string | Record<string, unknown>
    children: (args: { geographies: GeoFeature[] }) => ReactNode
  }
  export interface GeoFeature {
    rsmKey: string
    id:     string | number
    [key:   string]: unknown
  }
  export function Geographies(props: GeographiesProps): JSX.Element

  interface GeographyStyle {
    outline?: string
    fill?: string
    cursor?: string
  }
  interface GeographyProps {
    geography:   GeoFeature
    fill?:       string
    stroke?:     string
    strokeWidth?: number
    style?: {
      default?: GeographyStyle
      hover?:   GeographyStyle
      pressed?: GeographyStyle
    }
    onMouseMove?: (evt: React.MouseEvent<SVGPathElement>) => void
    onMouseLeave?: (evt: React.MouseEvent<SVGPathElement>) => void
    onClick?: (evt: React.MouseEvent<SVGPathElement>) => void
  }
  export function Geography(props: GeographyProps): JSX.Element
}
