/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        arc: {
          bg:        "#F8FAFC",
          surface:   "#FFFFFF",
          panel:     "#F1F5F9",
          border:    "#E2E8F0",
          sidebar:   "#16202C",
          sidebarHover: "#1E2B3A",
          accent:    "#2D6A4F",
          accentHover: "#245540",
          accent2:   "#2563EB",
          success:   "#16A34A",
          warning:   "#D97706",
          danger:    "#DC2626",
          muted:     "#64748B",
          text:      "#0F172A",
          textDim:   "#475569",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "Consolas", "monospace"],
        sans: ["Plus Jakarta Sans", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
