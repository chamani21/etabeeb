import type { Config } from 'tailwindcss'

// eTabeeb Design System Tokens (extracted from Stitch project 15674520729408700343)
const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // === Stitch Design System Tokens ===
        // Primary greens
        primary: '#004128',
        'primary-container': '#0b5a3a',
        'brand-green': '#0b5a3a',
        'brand-green-deep': '#073d28',
        'on-primary': '#ffffff',
        'on-primary-container': '#88cfa7',
        'inverse-primary': '#8ed6ac',
        'primary-fixed': '#aaf2c7',
        'primary-fixed-dim': '#8ed6ac',

        // Secondary greens
        secondary: '#386850',
        'secondary-container': '#b7ebcd',
        'on-secondary': '#ffffff',
        'on-secondary-container': '#3c6c54',
        'secondary-fixed': '#baeed0',
        'secondary-fixed-dim': '#9ed2b4',

        // Tertiary / gold
        tertiary: '#745b10',
        'tertiary-container': '#c7a857',
        'on-tertiary': '#ffffff',
        'gold-ink': '#8a6f2a',
        'gold-soft': '#d9c58f',

        // Surface palette
        surface: '#e8fff0',
        'surface-dim': '#c9dfd1',
        'surface-bright': '#e8fff0',
        'surface-container': '#ddf3e5',
        'surface-container-low': '#e2f9ea',
        'surface-container-high': '#d7eedf',
        'surface-container-highest': '#d1e8d9',
        'surface-container-lowest': '#ffffff',
        'canvas-white': '#ffffff',
        'canvas-off-white': '#f8faf8',
        'on-surface': '#0c1f16',
        'on-surface-variant': '#404942',
        'inverse-surface': '#21342b',
        'inverse-on-surface': '#dff6e7',

        // Structural
        'green-100': '#d3e9db',
        'green-50': '#e8f3ec',
        'ink-muted': '#4a5c53',
        hairline: '#d6e3da',
        outline: '#707972',
        'outline-variant': '#bfc9c0',
        'on-green': '#ffffff',

        // Error / Caution
        error: '#ba1a1a',
        'error-container': '#ffdad6',
        'on-error': '#ffffff',
        'on-error-container': '#93000a',
        caution: '#a8432f',

        // Integrations
        'whatsapp-green': '#25d366',
      },
      fontFamily: {
        // RTL — Naskh (body workhorse for Pashto, Dari, Urdu)
        naskh: ['var(--font-noto-naskh-arabic)', 'Scheherazade New', 'serif'],
        // RTL — Nastaliq (display/doctor names)
        nastaliq: ['var(--font-noto-nastaliq-urdu)', 'Gulzar', 'serif'],
        // LTR — Serif headlines
        serif: ['var(--font-noto-serif)', 'Georgia', 'serif'],
        // LTR — Data, credentials, numbers
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // RTL scale
        'urdu-display-naskh': ['56px', { lineHeight: '82px' }],
        'urdu-display-nastaliq': ['72px', { lineHeight: '144px' }],
        'urdu-headline': ['40px', { lineHeight: '60px' }],
        'urdu-subhead': ['28px', { lineHeight: '44px' }],
        'urdu-body-lg': ['20px', { lineHeight: '36px' }],
        'urdu-body': ['17px', { lineHeight: '30px' }],
        'urdu-label': ['15px', { lineHeight: '24px' }],
        'urdu-footer': ['13px', { lineHeight: '22px' }],
        // LTR scale
        'display-lg': ['48px', { lineHeight: '56px' }],
        'headline-lg': ['32px', { lineHeight: '40px' }],
        'title-md': ['20px', { lineHeight: '28px' }],
        'body-md': ['16px', { lineHeight: '24px' }],
        'label-md': ['14px', { lineHeight: '20px' }],
        'latin-credential': ['13px', { lineHeight: '18px' }],
        'latin-numeral': ['24px', { lineHeight: '24px' }],
      },
      borderRadius: {
        sm: '0.25rem',
        DEFAULT: '0.5rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.5rem',
        full: '9999px',
        arch: '999px 999px 0 0', // Kozhak Arch device
      },
      spacing: {
        'space-xs': '0.5rem',
        'space-sm': '1rem',
        'space-md': '1.5rem',
        'space-lg': '2rem',
        'space-xl': '3rem',
        gutter: '1rem',
        margin: '1.5rem',
      },
      boxShadow: {
        'card-soft': '0 12px 32px rgba(7, 61, 40, 0.08)',
        'portrait-contact': '0 20px 40px rgba(7, 61, 40, 0.14)',
        'plate-on-dark': '0 8px 24px rgba(0, 0, 0, 0.18)',
      },
    },
  },
  plugins: [],
}

export default config
