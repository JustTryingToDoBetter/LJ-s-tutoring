/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./*.html', './guides/**/*.html'],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: '#0f172a',
          gold: '#fbbf24',
          light: '#f8fafc',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
