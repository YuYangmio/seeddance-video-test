/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#3370FF', // 字节品牌蓝
          50: '#EEF4FF',
          100: '#D9E6FF',
          200: '#B3CCFF',
          300: '#80A8FF',
          400: '#5988FF',
          500: '#3370FF',
          600: '#1E5AE6',
          700: '#1747B3',
          800: '#123680',
          900: '#0B224D',
        },
        healing: {
          bg: '#F6F7FB',
          card: '#FFFFFF',
          border: '#E6E8F0',
          text: '#2B3046',
          muted: '#8A94A6',
        },
        result: {
          true: '#23A970',
          trueBg: '#E6F7EF',
          false: '#F5A623',
          falseBg: '#FFF4E3',
          null: '#8A94A6',
          nullBg: '#F1F3F7',
        },
      },
      borderRadius: {
        xl2: '16px',
        xl3: '20px',
      },
      boxShadow: {
        card: '0 4px 24px -8px rgba(51, 112, 255, 0.12), 0 1px 3px rgba(43, 48, 70, 0.04)',
        pop: '0 12px 40px -12px rgba(51, 112, 255, 0.25)',
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
