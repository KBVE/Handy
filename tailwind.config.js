/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        text: "var(--color-text)",
        background: "var(--color-background)",
        "logo-primary": "var(--color-logo-primary)",
        "logo-secondary": "var(--color-logo-secondary)",
        "logo-stroke": "var(--color-logo-stroke)",
        "text-stroke": "var(--color-text-stroke)",
        "accent-cyan": "var(--color-accent-cyan)",
        "accent-purple": "var(--color-accent-purple)",
      },
      animation: {
        "slide-in-right": "slideInRight 0.3s ease-out",
        "fade-out": "fadeOut 0.2s ease-out",
      },
      keyframes: {
        slideInRight: {
          "0%": { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        fadeOut: {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
      },
    },
  },
  plugins: [],
};
