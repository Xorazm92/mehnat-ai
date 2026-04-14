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
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['SF Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace']
      },
      colors: {
        '1c': {
          yellow: '#FFD600',
          'yellow-light': '#FFF3B0',
          'yellow-dark': '#E6B800',
          gold: '#FFB800',
          orange: '#FF8C00',
          blue: '#3366CC',
          'blue-light': '#4A8CFF',
          'blue-dark': '#1A3D7A',
          green: '#339933',
          'green-light': '#E8F5E9',
          red: '#CC3333',
          'red-light': '#FFEBEE',
          bg: '#F0F1F3',
          sidebar: '#FFD600',
          toolbar: '#FAFBFC',
          card: '#FFFFFF',
          border: '#E0E3E8',
        },
        navy: {
          950: '#0B0F1A',
          900: '#0F172A',
          850: '#141B2D',
          800: '#1E293B',
          700: '#334155'
        },
        chart: {
          blue: '#3366CC',
          pink: '#CC3333',
          purple: '#7B4FBF',
          emerald: '#339933',
          orange: '#FF8C00'
        },
        // Keep backward compat
        apple: {
          bg: '#F0F1F3',
          darkBg: '#1A1D23',
          card: '#FFFFFF',
          darkCard: '#22252B',
          accent: '#3366CC',
          border: '#E0E3E8',
          darkBorder: '#3A3D44'
        },
        glass: {
          white: '#FFFFFF',
          dark: '#22252B',
          border: '#E0E3E8',
          'border-dark': '#3A3D44'
        }
      },
      borderRadius: {
        '1c': '4px',
        '1c-lg': '6px',
      },
      boxShadow: {
        '1c': '0 1px 3px rgba(0, 0, 0, 0.08)',
        '1c-hover': '0 2px 8px rgba(0, 0, 0, 0.12)',
        '1c-inset': 'inset 0 1px 2px rgba(0, 0, 0, 0.06)',
        'glow-blue': '0 0 8px rgba(51, 102, 204, 0.3)',
        'premium': '0 1px 3px rgba(0,0,0,0.08)',
        'glass': '0 1px 3px rgba(0,0,0,0.08)',
        'glass-lg': '0 2px 8px rgba(0,0,0,0.12)',
        'glass-hover': '0 2px 8px rgba(0,0,0,0.12)',
        'glass-active': '0 1px 4px rgba(51,102,204,0.3)',
        'glass-inset': 'inset 0 1px 2px rgba(0,0,0,0.06)',
        'glass-indigo': '0 2px 6px rgba(51,102,204,0.2)',
        'glass-rose': '0 2px 6px rgba(204,51,51,0.2)',
        'glass-2xl': '0 2px 12px rgba(0,0,0,0.12)',
        'glass-sm': '0 1px 2px rgba(0,0,0,0.04)',
      },
      animation: {
        'shimmer': 'shimmer 2s infinite linear',
        'macos': 'subtleAppear 0.25s ease-out',
      },
      keyframes: {
        subtleAppear: {
          '0%': { opacity: 0, transform: 'translateY(4px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
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
