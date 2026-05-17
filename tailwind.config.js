/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#1a1b26',
          surface: '#24283b',
          elevated: '#292e42',
          border: '#3b4261',
          text: '#a9b1d6',
          muted: '#565f89',
          accent: '#7aa2f7',
          accentHover: '#61afef',
          green: '#9ece6a',
          red: '#f7768e',
          yellow: '#e0af68',
          purple: '#bb9af7',
        },
        light: {
          bg: '#ffffff',
          surface: '#f8f9fa',
          elevated: '#ffffff',
          border: '#e5e7eb',
          text: '#1f2937',
          muted: '#6b7280',
          accent: '#3b82f6',
          accentHover: '#2563eb',
          green: '#22c55e',
          red: '#ef4444',
          yellow: '#eab308',
          purple: '#a855f7',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [require('tailwind-scrollbar'), require('@tailwindcss/typography')],
};
