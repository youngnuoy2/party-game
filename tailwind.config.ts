import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#05050f', 900: '#0a0a1f', 800: '#12122e', 700: '#1c1c42', 600: '#2a2a5c' },
        neon: { blue: '#38bdf8', cyan: '#22d3ee', purple: '#a855f7', pink: '#ec4899', gold: '#fbbf24', green: '#4ade80', red: '#f87171' },
      },
      fontFamily: {
        sans: ['Pretendard', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', 'system-ui', 'sans-serif'],
        display: ['"Black Han Sans"', 'Pretendard', 'sans-serif'],
      },
      boxShadow: {
        neon: '0 0 20px rgba(56,189,248,.45), 0 0 60px rgba(168,85,247,.25)',
        gold: '0 0 24px rgba(251,191,36,.55)',
      },
    },
  },
  plugins: [],
} satisfies Config;
