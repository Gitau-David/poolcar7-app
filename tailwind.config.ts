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
        bg: "#0b1220",
        surface: "#0f172a",
        surface2: "#111d30",
        border: "#23314d",
        ink: "#edf3ff",
        muted: "#94a7c6",
        teal: "#4fe0c5",
        amber: "#f7c66d",
        red: "#f26a6a",
        blue: "#68a7ff",
      },
      boxShadow: {
        soft: "0 10px 30px rgba(15, 25, 42, 0.28)",
        elevated: "0 20px 50px rgba(3, 7, 18, 0.42)",
      },
      letterSpacing: {
        wider2: "0.12em",
      },
      fontFamily: {
        head: ['"Manrope"', 'sans-serif'],
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
      },
      animation: {
        shimmer: "shimmer 1.8s ease-in-out infinite",
        "pulse-slow": "pulse 2.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
