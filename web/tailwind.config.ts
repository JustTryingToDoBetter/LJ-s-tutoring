import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ody: {
          bg: '#0B0D12',
          surface: '#111522',
          elevated: '#151A2B',
          border: 'rgba(162,182,219,0.24)',
          text: '#EDF3FF',
          muted: '#97A8CB',
          purple: '#9B5CFF',
          blue: '#35B7FF',
          success: '#2DD199',
          warning: '#FFB648',
        },
      },
      borderRadius: {
        lg: '16px',
        xl: '20px',
      },
      boxShadow: {
        ody: '0 18px 40px rgba(5,7,13,0.45)',
      },
      backgroundImage: {
        'ody-gradient': 'linear-gradient(135deg, #8D4DFF 0%, #2CB5FF 100%)',
      },
    },
  },
  plugins: [],
};

export default config;
