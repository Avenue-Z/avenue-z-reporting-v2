# Avenue Z — Brand Guidelines for Reporting Platform

> This document defines the visual design system for the Avenue Z reporting
> platform. Claude Code must follow these guidelines precisely when building
> any UI component, page, or layout. Do not deviate from these tokens.

---

## Design Philosophy

Avenue Z is a **dark-first, high-contrast brand**. The aesthetic is premium,
modern, and tech-forward — dark backgrounds with white text, structured
layouts, and a signature gradient system that carries brand meaning. Every
surface should feel intentional and polished.

**Default theme: Dark** (`#000000` backgrounds). A light/reversed variant
exists for specific contexts (see below).

---

## Color System

### Main Palette (Dark Mode — Default)

```css
:root {
  /* Backgrounds */
  --color-bg-primary:    #000000;  /* Base background — use on page root */
  --color-bg-surface:    #272727;  /* Cards, panels, elevated surfaces */
  --color-bg-subtle:     #1a1a1a;  /* Subtle section dividers */

  /* Text */
  --color-text-primary:  #FFFFFF;  /* Primary text — maximum readability */
  --color-text-muted:    #8A8A8A;  /* Supporting / less prominent text */
  --color-text-inverse:  #000000;  /* Text on light surfaces */
}
```

### Reversed Palette (Light Mode — Client Portal Optional)

```css
:root[data-theme="light"] {
  --color-bg-primary:    #FFFFFF;
  --color-bg-surface:    #F2F2F2;
  --color-bg-subtle:     #E8E8E8;
  --color-text-primary:  #000000;
  --color-text-muted:    #8A8A8A;
}
```

### Secondary / Accent Colors

These five colors are the brand's expressive system. Use them for accents,
chart series, badges, highlights, and gradient construction.

```css
:root {
  /* Revenue spectrum (warm → cool) */
  --color-yellow:  #FFFC60;  /* Revenue — warm anchor */
  --color-green:   #60FF80;  /* Revenue */

  /* Revenue/Reputation bridge */
  --color-cyan:    #60FDFF;  /* Revenue + Reputation */

  /* Reputation spectrum (cool → deep) */
  --color-blue:    #39A0FF;  /* Reputation */
  --color-purple:  #6034FF;  /* Reputation — deep anchor */
}
```

**Usage rules:**
- Yellow + Green = Revenue-related metrics (spend, revenue, conversions)
- Cyan = Bridging/blended metrics (ROAS, CPA)
- Blue + Purple = Reputation/awareness metrics (impressions, reach, brand)
- Never use accent colors on large background areas — accents only
- Never use more than 3 accent colors in a single chart

### Gradients

The gradient system is **digital-only** (never print).

```css
:root {
  /* Full brand gradient — yellow → green → cyan → blue → purple */
  --gradient-full:       linear-gradient(135deg, #FFFC60, #60FF80, #60FDFF, #39A0FF, #6034FF);

  /* Revenue gradient — yellow → green → cyan */
  --gradient-revenue:    linear-gradient(135deg, #FFFC60, #60FF80, #60FDFF);

  /* Reputation gradient — cyan → blue → purple */
  --gradient-reputation: linear-gradient(135deg, #60FDFF, #39A0FF, #6034FF);

  /* Subtle background glow — used on page footers / section backgrounds */
  --gradient-glow-bg:    radial-gradient(ellipse at bottom right, #0d2a2a 0%, #000000 60%);
}
```

**Gradient applications:**
- `--gradient-full` — hero sections, section dividers, display headings
- `--gradient-revenue` — revenue KPI cards, positive trend indicators
- `--gradient-reputation` — reach/awareness KPI cards, CTR/impression metrics
- `--gradient-glow-bg` — subtle page background atmosphere (see Objects section)
- Gradient text: use `background-clip: text` on bold display headings only

---

## Typography

### Font Stack

The brand uses **Nunito Sans** (Google Fonts — free, web-ready) as the
primary typeface. This is the approved web alternative to the brand's primary
font Avenir.

```css
@import url('https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@300;400;700;800;900&display=swap');

:root {
  --font-primary: 'Nunito Sans', sans-serif;
}
```

### Type Scale

| Role | Weight | Size (web) | Usage |
|---|---|---|---|
| Display / Hero | ExtraBold 800 | 48–64px | Page titles, section heroes |
| H1 | Regular 400 | 36–48px | Report titles, page names |
| H2 Section Title | Bold 700 | 28–36px | Report section headings |
| H3 Subheading | Bold 700 | 20–24px | Card titles, subsections |
| Body | Light 300 | 14–16px | Paragraph text, descriptions |
| Label / Tag | ExtraBold 800 | 11–13px | Badges, status tags, table headers |
| Metric / KPI | ExtraBold 800 | 28–40px | KPI card numbers |

### Typography Rules

- Display headings use gradient text (`--gradient-full` or `--gradient-revenue`)
  for the **second/bold line** only; the first line stays white
- Body text is always `--color-text-primary` (#FFFFFF) or `--color-text-muted`
  (#8A8A8A) — never a color from the accent palette
- Letter spacing: Labels and tags use `letter-spacing: 0.08em` uppercase
- Line height: Body `1.6`, headings `1.1–1.2`

```css
/* Example: gradient display heading */
.display-heading span.gradient {
  background: var(--gradient-full);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-weight: 800;
  text-transform: uppercase;
}
```

---

## Components

### Cards / Surfaces

```css
.card {
  background: var(--color-bg-surface);   /* #272727 */
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  padding: 24px;
}

/* KPI / metric card */
.card-metric {
  background: var(--color-bg-surface);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 20px 24px;
  position: relative;
  overflow: hidden;
}

/* Subtle top-border gradient accent on KPI cards */
.card-metric::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: var(--gradient-revenue); /* or --gradient-reputation */
}
```

### Buttons

```css
/* Standard button — dark pill */
.btn {
  background: #3a3a3a;
  color: #FFFFFF;
  border: none;
  border-radius: 100px;         /* fully rounded pill */
  padding: 12px 24px;
  font-family: var(--font-primary);
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.04em;
  cursor: pointer;
}

/* CTA button — gradient fill */
.btn-cta {
  background: var(--gradient-revenue);
  color: #000000;               /* dark text on gradient */
  border: none;
  border-radius: 100px;
  padding: 12px 28px;
  font-family: var(--font-primary);
  font-weight: 800;
  font-size: 14px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
}
```

### Input / Text Fields

```css
.input {
  background: var(--color-bg-surface);   /* #272727 */
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 12px 16px;
  color: var(--color-text-primary);
  font-family: var(--font-primary);
  font-size: 14px;
}

.input:focus {
  outline: none;
  border-color: var(--color-cyan);
  box-shadow: 0 0 0 2px rgba(96, 253, 255, 0.15);
}
```

### Dividers / Lines

Three line styles from the brand Objects page:

```css
.divider-full {
  height: 1px;
  background: var(--gradient-full);    /* full spectrum line */
}

.divider-revenue {
  height: 1px;
  background: var(--gradient-revenue);
}

.divider-reputation {
  height: 1px;
  background: var(--gradient-reputation);
}
```

### Badges / Tags

```css
.badge {
  display: inline-flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 100px;
  padding: 4px 12px;
  font-family: var(--font-primary);
  font-weight: 800;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-primary);
}

.badge-connected { border-color: var(--color-green);  color: var(--color-green); }
.badge-pending   { border-color: var(--color-yellow); color: var(--color-yellow); }
.badge-expired   { border-color: var(--color-purple); color: var(--color-purple); }
.badge-error     { border-color: #ff4444;             color: #ff4444; }
```

### Glow Effects

The brand uses two types of ambient glow, visible in the brand guidelines:

```css
/* Page-level background glow — applied to body/root */
.bg-glow {
  background:
    var(--color-bg-primary)
    radial-gradient(ellipse 60% 40% at 90% 100%, rgba(0, 60, 60, 0.5) 0%, transparent 70%),
    radial-gradient(ellipse 40% 30% at 80% 100%, rgba(30, 0, 80, 0.4) 0%, transparent 60%);
}

/* Element-level gradient glow bar — used under feature sections */
.glow-bar {
  height: 8px;
  border-radius: 100px;
  background: var(--gradient-full);
  filter: blur(12px);
  opacity: 0.7;
}
```

---

## Chart Color Mapping

When rendering multi-series charts, map data channels to brand colors
consistently. Define this in `lib/constants.ts`:

```typescript
// lib/constants.ts
export const CHART_COLORS = {
  // Single-series or primary line
  primary:     '#60FDFF',  // cyan

  // Multi-channel series
  ga4:         '#39A0FF',  // blue       — web/organic
  metaAds:     '#6034FF',  // purple     — Meta paid
  googleAds:   '#60FF80',  // green      — Google paid
  email:       '#FFFC60',  // yellow     — email
  linkedin:    '#60FDFF',  // cyan       — LinkedIn
  blended:     '#FFFFFF',  // white      — blended/total lines

  // Positive / negative deltas
  positive:    '#60FF80',  // green
  negative:    '#FF4444',  // red (not brand but universally understood)
  neutral:     '#8A8A8A',  // grey
} as const
```

---

## Layout & Spacing

### Spacing Scale

Use an 8px base grid throughout:

```css
:root {
  --space-1:  4px;
  --space-2:  8px;
  --space-3:  12px;
  --space-4:  16px;
  --space-5:  24px;
  --space-6:  32px;
  --space-7:  48px;
  --space-8:  64px;
  --space-9:  96px;
}
```

### Border Radius Scale

```css
:root {
  --radius-sm:   8px;    /* small elements: tags, inputs */
  --radius-md:   12px;   /* standard cards */
  --radius-lg:   16px;   /* large cards, panels */
  --radius-xl:   24px;   /* hero sections */
  --radius-full: 100px;  /* pills: buttons, badges */
}
```

### Page Layout

```css
/* App shell */
.app-shell {
  display: grid;
  grid-template-columns: 240px 1fr;  /* sidebar + main */
  min-height: 100vh;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-family: var(--font-primary);
}

/* Sidebar */
.sidebar {
  background: var(--color-bg-surface);
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  padding: var(--space-6) var(--space-5);
}

/* Main content area */
.main-content {
  padding: var(--space-6) var(--space-7);
  max-width: 1400px;
}

/* Report section grid */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-5);
}
```

---

## Tailwind Config

Map the full brand system into `tailwind.config.ts`:

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Backgrounds
        'bg-primary':    '#000000',
        'bg-surface':    '#272727',
        'bg-subtle':     '#1a1a1a',

        // Text
        'text-primary':  '#FFFFFF',
        'text-muted':    '#8A8A8A',

        // Accents
        'brand-yellow':  '#FFFC60',
        'brand-green':   '#60FF80',
        'brand-cyan':    '#60FDFF',
        'brand-blue':    '#39A0FF',
        'brand-purple':  '#6034FF',
      },
      fontFamily: {
        sans: ['Nunito Sans', 'sans-serif'],
      },
      borderRadius: {
        'sm':   '8px',
        'md':   '12px',
        'lg':   '16px',
        'xl':   '24px',
        'pill': '100px',
      },
      backgroundImage: {
        'gradient-full':       'linear-gradient(135deg, #FFFC60, #60FF80, #60FDFF, #39A0FF, #6034FF)',
        'gradient-revenue':    'linear-gradient(135deg, #FFFC60, #60FF80, #60FDFF)',
        'gradient-reputation': 'linear-gradient(135deg, #60FDFF, #39A0FF, #6034FF)',
        'gradient-glow-bg':    'radial-gradient(ellipse at bottom right, #0d2a2a 0%, #000000 60%)',
      },
    },
  },
  plugins: [],
}

export default config
```

---

## Sidebar Navigation

The sidebar follows the brand's vertical pill-tab pattern (similar to the
vertical "BRAND GUIDELINES" label seen throughout the PDF):

```tsx
// Sidebar nav item pattern
<nav className="flex flex-col gap-1">
  <NavItem href="/dashboard" icon={<GridIcon />} label="Clients" />
  <NavItem href="/dashboard/reports" icon={<ChartIcon />} label="Reports" />
</nav>

// Active state: white pill background, black text
// Inactive state: transparent bg, muted text
// Hover: bg-subtle, white text
```

---

## Report Section Header Pattern

Every report section uses a consistent two-line heading pattern matching
the brand's heading style:

```tsx
<div className="mb-6">
  <p className="text-text-muted text-sm font-bold uppercase tracking-widest">
    Performance Overview  {/* first line — muted, small */}
  </p>
  <h2 className="text-white text-3xl font-extrabold uppercase">
    META <span className="bg-gradient-full bg-clip-text text-transparent">
      ADS
    </span>
  </h2>
</div>
```

---

## Do / Don't

| ✅ Do | ❌ Don't |
|---|---|
| Use `#000000` or `#272727` for all backgrounds | Use white or light grey as default bg |
| Use `Nunito Sans` for all text | Use Inter, Roboto, or system fonts |
| Apply gradients to text on bold display headings | Apply gradients to body text or small labels |
| Use pill-shaped buttons and badges | Use square buttons or standard border-radius |
| Match chart color to channel (see CHART_COLORS) | Use random or default Recharts colors |
| Use `#8A8A8A` for supporting/secondary text | Use light grey or white for all text |
| Apply a subtle bottom glow to page backgrounds | Use flat solid black on every surface |
| Use gradient divider lines between sections | Use plain grey `<hr>` elements |
| Keep accent colors to 2–3 per view max | Saturate every element with brand colors |
| Default to dark mode | Default to light mode |

---

## Avatar / Logo Treatment

The Avenue Z logomark is a white `Z` in a dark rounded pill shape
(`#1a1a1a` background, white border, white `Z`).

In the sidebar header:

```tsx
<div className="flex items-center gap-3 mb-8">
  <div className="w-9 h-9 rounded-pill bg-[#1a1a1a] border border-white/20
                  flex items-center justify-center">
    <span className="text-white font-extrabold text-sm">Z</span>
  </div>
  <span className="text-white font-bold text-sm tracking-wide">Avenue Z</span>
</div>
```

---

## shadcn/ui Theme Overrides

When using shadcn/ui components, override the CSS variables in `globals.css`
to align with the Avenue Z system:

```css
/* app/globals.css */
@layer base {
  :root {
    --background:         0 0% 0%;         /* #000000 */
    --foreground:         0 0% 100%;       /* #FFFFFF */
    --card:               0 0% 15%;        /* #272727 */
    --card-foreground:    0 0% 100%;
    --popover:            0 0% 15%;
    --popover-foreground: 0 0% 100%;
    --primary:            191 100% 68%;    /* #60FDFF cyan */
    --primary-foreground: 0 0% 0%;
    --secondary:          0 0% 15%;
    --secondary-foreground: 0 0% 100%;
    --muted:              0 0% 15%;
    --muted-foreground:   0 0% 54%;        /* #8A8A8A */
    --accent:             191 100% 68%;
    --accent-foreground:  0 0% 0%;
    --destructive:        0 84% 60%;
    --border:             0 0% 100% / 0.08;
    --input:              0 0% 15%;
    --ring:               191 100% 68%;
    --radius:             0.75rem;
  }
}
```

---

## Tremor Theme Overrides

When using Tremor components, configure the color palette to match:

```tsx
// Point Tremor's chart colors at brand palette
const tremorColors = {
  blue:   '#39A0FF',
  cyan:   '#60FDFF',
  green:  '#60FF80',
  yellow: '#FFFC60',
  purple: '#6034FF',
  gray:   '#8A8A8A',
}
```

Use `className` overrides on Tremor `Card` components:

```tsx
<Card className="bg-bg-surface border border-white/[0.06] rounded-lg">
```

---

## References

- Brand Guidelines PDF: v.2026-1, February 2026
- Google Font: https://fonts.google.com/specimen/Nunito+Sans
- Brand contact: marketing@avenuez.com