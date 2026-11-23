/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        val: {
          bg: '#080B10',
          surface: '#0D131C',
          card: '#121A26',
          cardHover: '#182436',
          border: '#1E2C3D',
          borderHover: '#2E445E',
          red: '#FF4655',
          redHover: '#E03746',
          redGlow: 'rgba(255, 70, 85, 0.3)',
          mint: '#00F5D4',
          mintGlow: 'rgba(0, 245, 212, 0.25)',
          gold: '#F59E0B',
          goldGlow: 'rgba(245, 158, 11, 0.25)',
          purple: '#8B5CF6',
          muted: '#8A9EB2',
          dim: '#55687A',
          light: '#F8FAFC',
          danger: '#FF4655',
          success: '#10B981',
          warning: '#F59E0B',
        }
      },
      fontFamily: {
        sans: ['Inter', '"Segoe UI"', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Chakra Petch"', 'Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Consolas', '"SF Mono"', 'monospace'],
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.15s ease-out',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.6', transform: 'scale(0.96)' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'scale(0.98)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        }
      }
    },
  },
  plugins: [],
}
