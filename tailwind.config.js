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
        'iran-sans': ['Vazir', 'Noto Sans Arabic', 'sans-serif'],
        'latin': ['Inter', 'ui-sans-serif', 'system-ui']
      },
      colors: {
        dark: {
          bg: '#0a0a0a',
          card: '#1a1a1a',
          border: '#2a2a2a',
          text: '#e5e5e5',
          muted: '#737373'
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