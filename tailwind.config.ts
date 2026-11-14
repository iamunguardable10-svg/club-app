import type { Config } from 'tailwindcss';

/**
 * The Club OS palette (DESIGN.md "Colour"). The Tailwind names stay, their
 * values are ours: `slate` is a near-neutral graphite ramp (surfaces get
 * lighter as they rise, text sits at 400 and above), `emerald` the one brand
 * and action green, `sky` a quiet blue for links and information, `red` is
 * the same ramp as `rose` so "missing" has one colour.
 */
const graphite = {
  50: '#f7f8fa',
  100: '#eceef1',
  200: '#dcdfe4',
  300: '#c2c6cd',
  400: '#a0a5ae',
  500: '#7e848e',
  600: '#4d525b',
  700: '#33373e',
  800: '#272a2f',
  900: '#1f2226',
  950: '#17191c',
};
const green = {
  50: '#ebfdf4',
  100: '#cffae3',
  200: '#a3f2c9',
  300: '#5fe3a6',
  400: '#34cd8a',
  500: '#1fae71',
  600: '#168b5b',
  700: '#136e4a',
  800: '#12563c',
  900: '#0f4331',
  950: '#07271c',
};
const blue = {
  50: '#f1f6fe',
  100: '#dde9fd',
  200: '#bdd4fa',
  300: '#92b8f5',
  400: '#6f9dee',
  500: '#4f82e0',
  600: '#3a68c2',
  700: '#2f539c',
  800: '#28457c',
  900: '#223860',
  950: '#15233d',
};
const rose = {
  50: '#fff2f3',
  100: '#ffe2e5',
  200: '#fdc9cf',
  300: '#f9a3ad',
  400: '#f27886',
  500: '#e24f62',
  600: '#c5364b',
  700: '#a2293d',
  800: '#832536',
  900: '#6b2331',
  950: '#3b0e17',
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
        ground: '#0e0f11',
        slate: graphite,
        emerald: green,
        sky: blue,
        rose,
        red: rose,
        background: '#0e0f11',
        surface: graphite[950],
        muted: graphite[400],
      },
      // Three radii by size of the thing: panels and sheets (3xl), rows,
      // tiles, fields and buttons (2xl, xl), small marks (lg, md).
      borderRadius: {
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.625rem',
        '2xl': '0.75rem',
        '3xl': '1.125rem',
      },
    },
  },
  plugins: [],
};

export default config;
