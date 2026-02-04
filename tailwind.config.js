/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './App.tsx',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './supabase/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'sans-serif'],
        mono: ['SF Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace']
      },
      colors: {
        apple: {
          bg: '#F5F5F7',
          darkBg: '#1C1C1E',
          card: 'rgba(255, 255, 255, 0.7)',
          darkCard: 'rgba(44, 44, 46, 0.7)',
          accent: '#007AFF',
          border: 'rgba(0,0,0,0.08)',
          darkBorder: 'rgba(255,255,255,0.1)'
        }
      },
      fontSize: {
        xxs: '0.65rem',
        tiny: '0.75rem',
        'base-plus': '0.938rem'
      }
    }
  },
  plugins: []
};
