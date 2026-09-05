import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  safelist: ["grid-cols-7"],
  theme: {
    extend: {
      colors: {
        background: "#09090b",
        foreground: "#fafafa",
        card: "#121215",
        "card-border": "#27272a",
        muted: "#a1a1aa",
        "muted-dark": "#18181b",
        accent: {
          studying: "#22c55e",
          "studying-bg": "rgba(34, 197, 94, 0.1)",
          break: "#f59e0b",
          "break-bg": "rgba(245, 158, 11, 0.1)",
          offline: "#71717a",
          "offline-bg": "rgba(113, 113, 122, 0.1)",
          achiever: "#eab308",
          "achiever-bg": "rgba(234, 179, 8, 0.1)",
          night: "#a855f7",
          "night-bg": "rgba(168, 85, 247, 0.1)",
          early: "#3b82f6",
          "early-bg": "rgba(59, 130, 246, 0.1)",
        },
      },
    },
  },
  plugins: [],
};
export default config;
