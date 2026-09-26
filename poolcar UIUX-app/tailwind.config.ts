import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0B1220",
        surface: "#131B2E",
        surface2: "#1B2740",
        border: "#24314D",
        ink: "#E5EAF3",
        muted: "#8A94A8",
        teal: "#2DD4BF",
        amber: "#F5A524",
        red: "#F16565",
        blue: "#5B9CF6",
      },
      fontFamily: {
        head: ["'Space Grotesk'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
      boxShadow: {
        // Flat borders read as generic "SaaS card kit" at scale — a soft,
        // low-spread shadow gives surfaces real depth without a heavy look.
        soft: "0 1px 2px rgba(0,0,0,0.24), 0 8px 24px -12px rgba(0,0,0,0.45)",
        elevated: "0 4px 8px rgba(0,0,0,0.3), 0 16px 40px -16px rgba(0,0,0,0.6)",
        glow: "0 0 0 1px rgba(45,212,191,0.4), 0 0 24px -4px rgba(45,212,191,0.35)",
      },
      keyframes: {
        pulseSlow: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
        radarSweep: {
          "0%": { transform: "rotate(0deg)", opacity: "0.5" },
          "100%": { transform: "rotate(360deg)", opacity: "0.5" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
      },
      animation: {
        "pulse-slow": "pulseSlow 2.4s ease-in-out infinite",
        "radar-sweep": "radarSweep 6s linear infinite",
        shimmer: "shimmer 1.6s linear infinite",
      },
      letterSpacing: {
        wider2: "0.08em",
      },
    },
  },
  plugins: [],
};
export default config;
