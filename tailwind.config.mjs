/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      colors: {
        film: {
          bg:       "#0C0B0A",
          surface:  "#161412",
          surface2: "#1E1C19",
          border:   "#2C2820",
          text:     "#EDE8DF",
          muted:    "#7A7065",
          faint:    "#3A3530",
          amber:    "#C9A96E",
          "amber-hover": "#D4B98A",
        },
      },
      fontFamily: {
        serif: ["Cormorant Garamond", "Georgia", "serif"],
        sans:  ["DM Sans", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
