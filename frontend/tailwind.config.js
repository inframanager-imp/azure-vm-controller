/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // We enforce dark mode by default on the body
  theme: {
    extend: {
      colors: {
        gyan: {
          teal: '#14B8A6',
          green: '#22C55E',
          darkBg: '#090D16',       // Dark deep space background
          darkPanel: '#111827',    // Base card panels
          glassBorder: 'rgba(255, 255, 255, 0.08)',
        }
      },
      fontFamily: {
        sans: ['Inter', 'Outfit', 'sans-serif'],
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'glass-glow': '0 0 20px rgba(20, 184, 166, 0.15)',
      }
    },
  },
  plugins: [],
}
