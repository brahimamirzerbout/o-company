/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{ts,tsx}",
    "../../apps/*/src/**/*.{ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink:    "rgb(var(--o-ink) / <alpha-value>)",
        ink2:   "rgb(var(--o-ink2) / <alpha-value>)",
        ink3:   "rgb(var(--o-ink3) / <alpha-value>)",
        ink4:   "rgb(var(--o-ink4) / <alpha-value>)",
        cream:  "rgb(var(--o-cream) / <alpha-value>)",
        cream2: "rgb(var(--o-cream2) / <alpha-value>)",
        cream3: "rgb(var(--o-cream3) / <alpha-value>)",
        cream4: "rgb(var(--o-cream4) / <alpha-value>)",
        accent: "rgb(var(--o-accent) / <alpha-value>)",
        "accent-soft": "rgb(var(--o-accent-soft) / <alpha-value>)",
        "accent-lite": "rgb(var(--o-accent-lite) / <alpha-value>)",
      },
      fontFamily: {
        serif: ["var(--o-font-serif-var)", "Georgia", "serif"],
        sans:  ["var(--o-font-sans-var)", "system-ui", "sans-serif"],
        mono:  ["var(--o-font-mono-var)", "ui-monospace", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
        "xs":  ["0.75rem",   { lineHeight: "1.1rem" }],
      },
      borderRadius: {
        sm: "0.25rem",
        md: "0.5rem",
    },
      animation: {
        "fade-in":   "fadeIn 0.4s ease-out",
        "slide-up":  "slideUp 0.4s ease-out",
        "pulse-soft": "pulseSoft 2.4s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        slideUp: { from: { transform: "translateY(8px)", opacity: "0" }, to: { transform: "translateY(0)", opacity: "1" } },
        pulseSoft: { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0.6" } },
      },
    },
  },
  plugins: [],
};
