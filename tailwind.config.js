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
          darkBg: '#0B0F19',
          card: 'rgba(255, 255, 255, 0.55)',
          darkCard: 'rgba(22, 27, 41, 0.55)',
          accent: '#007AFF',
          border: 'rgba(255,255,255,0.45)',
          darkBorder: 'rgba(255,255,255,0.08)'
        },
        glass: {
          white: 'rgba(255, 255, 255, 0.55)',
          dark: 'rgba(15, 23, 42, 0.55)',
          border: 'rgba(255, 255, 255, 0.45)',
          'border-dark': 'rgba(255, 255, 255, 0.08)'
        }
      },
      backdropBlur: {
        '3xl': '64px'
      },
      boxShadow: {
        'glow-blue': '0 0 20px rgba(59, 130, 246, 0.4)',
        'premium': '0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
        'glass': '0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
        'glass-lg': '0 20px 60px rgba(0,0,0,0.1), 0 4px 16px rgba(0,0,0,0.06)',
        'glass-hover': '0 24px 64px rgba(0,0,0,0.12), 0 8px 24px rgba(0,0,0,0.08)',
        'glass-active': '0 8px 24px rgba(0,122,255,0.35), inset 0 1px 0 rgba(255,255,255,0.2)',
        'glass-inset': 'inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.05)'
      },
      animation: {
        'shimmer': 'shimmer 2s infinite linear',
        'macos': 'macos 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)',
        'iridescent': 'iridescent 6s ease infinite',
        'glass-float': 'glassFloat 4s ease-in-out infinite',
      },
      keyframes: {
        macos: {
          '0%': { opacity: 0, transform: 'scale(0.96) translateY(12px)' },
          '100%': { opacity: 1, transform: 'scale(1) translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        iridescent: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        glassFloat: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
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
