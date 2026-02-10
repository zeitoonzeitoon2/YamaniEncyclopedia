/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        'sans': ['Vazir', 'Noto Sans Arabic', 'Tahoma', 'ui-sans-serif', 'system-ui'],
        'farhang': ['Vazir', 'Noto Sans Arabic', 'serif'],
        'ibm-plex-arabic': ['IBM Plex Sans Arabic', 'sans-serif'],
        'iran-sans': ['Vazir', 'Noto Sans Arabic', 'sans-serif'],
        'latin': ['Inter', 'ui-sans-serif', 'system-ui']
      },
      colors: {
        site: {
          bg: 'rgb(var(--site-bg) / <alpha-value>)',
          card: 'rgb(var(--site-card) / <alpha-value>)',
          border: 'rgb(var(--site-border) / <alpha-value>)',
          text: 'rgb(var(--site-text) / <alpha-value>)',
          muted: 'rgb(var(--site-muted) / <alpha-value>)',
          secondary: 'rgb(var(--site-secondary) / <alpha-value>)',
          accent: 'rgb(var(--site-accent) / <alpha-value>)'
        },
        warm: {
          primary: '#d97706',
          secondary: '#92400e',
          accent: '#f59e0b',
          coffee: '#8b4513',
          cream: '#f5f5dc',
          success: '#059669',
          warning: '#d97706',
          error: '#dc2626'
        }
      }
    },
  },
  plugins: [require('@tailwindcss/forms')],
}
