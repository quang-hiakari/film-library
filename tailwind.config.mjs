/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      colors: {
        film: {
          // Paper / light palette (default)
          bg:       "#F4F1EA",
          surface:  "#EAE5DB",
          surface2: "#E0DACE",
          border:   "#D6CFC0",
          hairline: "rgba(28,24,18,0.12)",
          text:     "#1C1812",
          muted:    "#6B6359",
          faint:    "#B5AC9C",
          amber:    "#A07B3A",
          "amber-hover": "#8C6A2E",
          "amber-soft": "rgba(160,123,58,0.14)",
        },
      },
      fontFamily: {
        serif: ["Cormorant Garamond", "Georgia", "serif"],
        sans:  ["DM Sans", "system-ui", "sans-serif"],
        mono:  ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
