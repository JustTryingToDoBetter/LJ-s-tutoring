/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./*.html', './guides/**/*.html'],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: '#0f172a',
          gold: '#9b6e00', // Darkened further for WCAG AA with white text (4.5:1 ratio)
          light: '#f8fafc',
        },
        // Accessibility overrides: Darken/strengthen colors to meet WCAG AA (4.5:1 contrast)
        green: {
          400: '#4ade80', // Lighter green for text on dark backgrounds
          500: '#008933', // Darkened from #10b981 for sufficient contrast with white text
          600: '#007329', // Darkened from #059669 for sufficient contrast on white background
        },
        blue: {
          500: '#2563eb', // Darkened from #3b82f6 for badge contrast
        },
        purple: {
          500: '#9333ea', // Darkened from #a855f7 for badge contrast
        },
        amber: {
          500: '#d97706', // Darkened from #f59e0b for button contrast
          600: '#b45309', // Hover state
        },
        slate: {
          500: '#475569', // Keep default - works on light backgrounds
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
