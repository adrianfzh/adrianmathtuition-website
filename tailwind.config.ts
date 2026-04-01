import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: 'hsl(220, 60%, 20%)', light: 'hsl(220, 40%, 30%)' },
        amber: { DEFAULT: 'hsl(45, 90%, 55%)', light: 'hsl(45, 90%, 92%)', dark: 'hsl(40, 80%, 42%)' },
        background: 'hsl(210, 20%, 98%)',
        foreground: 'hsl(220, 40%, 13%)',
        card: 'hsl(0, 0%, 100%)',
        muted: { DEFAULT: 'hsl(220, 15%, 93%)', foreground: 'hsl(220, 10%, 46%)' },
        border: 'hsl(220, 15%, 88%)',
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        display: ['DM Serif Display', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
