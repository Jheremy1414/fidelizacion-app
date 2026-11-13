/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        block: {
          cobalt: '#0B4BE3',
          cyan: '#0EA5E9',
          amber: '#FF7A00',
          gold: '#F59E0B',
          dark: '#090D16',
          surface: '#111827',
          light: '#F8FAFC',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Plus Jakarta Sans', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        'glass': '0 8px 32px -8px rgba(11, 75, 227, 0.14)',
        'precision': '0 1px 3px rgba(15, 23, 42, 0.05), 0 10px 24px -10px rgba(15, 23, 42, 0.08)',
        'glow-cobalt': '0 10px 30px -8px rgba(11, 75, 227, 0.45)',
        'glow-amber': '0 10px 28px -8px rgba(255, 122, 0, 0.42)',
      },
    },
  },
  plugins: [],
};

