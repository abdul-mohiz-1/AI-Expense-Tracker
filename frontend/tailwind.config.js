/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],

  theme: {
    extend: {
      colors: {
        // ── Brand: sage/emerald green — trust, nature, finance ───────────
        brand: {
          50:  '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',   // primary CTA
          700: '#047857',   // hover
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },
      },

      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },

      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },

      boxShadow: {
        // Soft, realistic shadows — no glows
        'xs':     '0 1px 2px 0 rgba(0,0,0,0.05)',
        'sm':     '0 1px 3px 0 rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.05)',
        'card':   '0 1px 3px 0 rgba(0,0,0,0.06), 0 4px 12px -2px rgba(0,0,0,0.05)',
        'dialog': '0 4px 6px -1px rgba(0,0,0,0.07), 0 10px 30px -4px rgba(0,0,0,0.08)',
        'green':  '0 4px 14px 0 rgba(5,150,105,0.20)',
      },

      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },

      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to:   { opacity: '1', transform: 'translateY(0)'   },
        },
        'slide-in-from-bottom-2': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)'   },
        },
        'spin-slow':    { from: { transform: 'rotate(0deg)'   }, to: { transform: 'rotate(360deg)'  } },
        'spin-reverse': { from: { transform: 'rotate(0deg)'   }, to: { transform: 'rotate(-360deg)' } },
        'shimmer': {
          '0%':   { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition:  '200% center' },
        },
      },
      animation: {
        'fade-in':      'fade-in      0.2s  ease forwards',
        'slide-in':     'slide-in-from-bottom-2 0.25s ease forwards',
        'spin-slow':    'spin-slow    2s    linear infinite',
        'spin-reverse': 'spin-reverse 0.8s  linear infinite',
        'shimmer':      'shimmer      2s    linear infinite',
      },
    },
  },

  plugins: [],
};