import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#b22830",
          dark: "#8f1f26",
        },
      },
      keyframes: {
        shake: {
          '0%, 80%, 100%': { transform: 'translateX(0)' },
          '83%': { transform: 'translateX(-4px)' },
          '86%': { transform: 'translateX(4px)' },
          '89%': { transform: 'translateX(-4px)' },
          '92%': { transform: 'translateX(4px)' },
          '95%': { transform: 'translateX(-2px)' },
          '98%': { transform: 'translateX(2px)' },
        }
      },
      animation: {
        shake: 'shake 5s infinite',
      }
    },
  },
  plugins: [],
};

export default config;
