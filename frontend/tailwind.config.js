/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'stock-aapl': '#2196F3',
        'stock-googl': '#F44336',
        'stock-msft': '#4CAF50',
        'stock-amzn': '#FF9800',
        'stock-tsla': '#9C27B0',
      },
      animation: {
        'pulse-subtle': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}
