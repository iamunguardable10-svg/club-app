import type { Config } from 'tailwindcss';

/**
 * The Club OS palette (DESIGN.md "Colour"). The Tailwind names stay, their
 * values are ours: `slate` is a midnight-ink ramp (surfaces get lighter as
 * they rise, text sits at 400 and above and is brighter than Tailwind's),
 * `emerald` the brand green, `sky` the second accent (an electric blue for
 * links, focus and information), `red` is the same ramp as `rose`.
 */
const ink = {
  50: '#f6f8ff',
  100: '#eaeefb',
  200: '#d8def0',
  300: '#c0c9e2',
  400: '#a1acc9',
  500: '#7985a8',
  600: '#515c7e',
  700: '#323d5b',
  800: '#232c45',
  900: '#182036',
  950: '#111727',
};
const green = {
  50: '#e9fff5',
  100: '#c8fde4',
  200: '#93f7c9',
  300: '#4eeda8',
  400: '#22d48c',
  500: '#12b274',
  600: '#0c8f5d',
  700: '#0c714c',
  800: '#0d593e',
  900: '#0b4633',
  950: '#04271c',
};
const blue = {
  50: '#f0f5ff',
  100: '#dfe9ff',
  200: '#c0d4ff',
  300: '#93b4ff',
  400: '#6b93ff',
  500: '#4a74f5',
  600: '#3659d6',
  700: '#2c47aa',
  800: '#273d86',
  900: '#22346a',
  950: '#141f42',
};
const rose = {
  50: '#fff1f3',
  100: '#ffe1e6',
  200: '#ffc6ce',
  300: '#ff9eab',
  400: '#ff7385',
  500: '#f24862',
  600: '#d22d4a',
  700: '#ad213c',
  800: '#8b1f36',
  900: '#701f32',
  950: '#3f0c18',
};

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
        // The page itself; surfaces on it are `slate-950` and lighter.
        ground: '#080b14',
        slate: ink,
        emerald: green,
        sky: blue,
        rose,
        red: rose,
        background: '#080b14',
        surface: ink[950],
        muted: ink[400],
      },
      // One step larger than Tailwind's small sizes: 13 px is the smallest
      // text, 15 px the size of a sentence (DESIGN.md "Type").
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.125rem' }],
        sm: ['0.9375rem', { lineHeight: '1.375rem' }],
        base: ['1.0625rem', { lineHeight: '1.5rem' }],
        lg: ['1.1875rem', { lineHeight: '1.625rem' }],
        xl: ['1.375rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.625rem', { lineHeight: '2rem' }],
        '3xl': ['2rem', { lineHeight: '2.375rem' }],
      },
      // Inter is a variable font: the steps between the usual weights carry the hierarchy.
      fontWeight: {
        medium: '500',
        semibold: '650',
        bold: '760',
      },
      // Radii by the size of the thing: panels and sheets (3xl), tiles and
      // rows (2xl), fields and buttons (xl), small marks (lg, md).
      borderRadius: {
        md: '0.5rem',
        lg: '0.625rem',
        xl: '0.8125rem',
        '2xl': '1rem',
        '3xl': '1.375rem',
      },
    },
  },
  plugins: [],
};

export default config;
