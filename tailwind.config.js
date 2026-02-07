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
        navy: {
          950: '#0B0F1A',
          900: '#0F172A',
          850: '#141B2D',
          800: '#1E293B',
          700: '#334155'
        },
        chart: {
          blue: '#3B82F6',
          pink: '#F43F5E',
          purple: '#A855F7',
          emerald: '#10B981',
          orange: '#F59E0B'
        },
        apple: {
          bg: '#F5F5F7',
          darkBg: '#0F172A',
          card: 'rgba(255, 255, 255, 0.7)',
          darkCard: 'rgba(30, 41, 59, 0.4)',
          accent: '#007AFF',
          border: 'rgba(0,0,0,0.08)',
          darkBorder: 'rgba(255,255,255,0.06)'
        }
      },
      boxShadow: {
        'glow-blue': '0 0 20px rgba(59, 130, 246, 0.4)',
        'premium': '0 10px 40px -10px rgba(0,0,0,0.1)'
      },
      animation: {
        'shimmer': 'shimmer 2s infinite linear',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
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
