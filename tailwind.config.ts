import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        rose: {
          50: "#fff0f3",
          100: "#fce4ec",
          200: "#f8bbd0",
          300: "#f48fb1",
          400: "#ec407a",
        },
        sky: {
          50: "#f0f7ff",
          100: "#e3f2fd",
          200: "#bbdefb",
          300: "#90caf9",
          400: "#42a5f5",
        },
      },
    },
  },
  plugins: [typography],
};

export default config;
