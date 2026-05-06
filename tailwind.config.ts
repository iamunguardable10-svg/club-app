import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/features/**/*.{ts,tsx}',
    './src/entities/**/*.{ts,tsx}',
    './src/shared/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#070A12',
        surface: '#0F172A',
        muted: '#94A3B8',
      },
    },
  },
  plugins: [],
};

export default config;
