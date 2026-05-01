/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg:       "#0d1117",
        surface:  "#161b22",
        border:   "#30363d",
        muted:    "#8b949e",
        text:     "#c9d1d9",
        blue:     "#58a6ff",
        green:    "#3fb950",
        red:      "#f85149",
        yellow:   "#d29922",
        purple:   "#bc8cff",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
        mono: ["JetBrains Mono", "ui-monospace"],
      },
    },
  },
  plugins: [],
};
