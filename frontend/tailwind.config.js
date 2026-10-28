/** @type {import('tailwindcss').Config} */
const token = (name) => `hsl(var(--${name}) / <alpha-value>)`;

module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: token("background"),
        foreground: token("foreground"),
        surface: {
          DEFAULT: token("surface"),
          2: token("surface-2"),
        },
        card: {
          DEFAULT: token("card"),
          foreground: token("card-foreground"),
        },
        muted: {
          DEFAULT: token("muted"),
          foreground: token("muted-foreground"),
        },
        secondary: {
          DEFAULT: token("secondary"),
          foreground: token("secondary-foreground"),
        },
        border: token("border"),
        input: token("input"),
        ring: token("ring"),
        primary: {
          DEFAULT: token("primary"),
          hover: token("primary-hover"),
          foreground: token("primary-foreground"),
        },
        brand: {
          DEFAULT: token("brand"),
          solid: token("brand-solid"),
          foreground: token("brand-foreground"),
          soft: token("brand-soft"),
          line: token("brand-line"),
        },
        success: token("success"),
        warning: token("warning"),
        pending: token("pending"),
        danger: token("danger"),
        info: token("info"),
        overlay: token("overlay"),
      },
      fontFamily: {
        sans: ["var(--font-yekan)", "Tahoma", "system-ui", "sans-serif"],
        vazir: ["var(--font-yekan)", "Tahoma", "sans-serif"],
      },
      fontWeight: {
        extrablack: "950",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        xs: "0 1px 2px 0 hsl(var(--shadow-color) / 0.06)",
        card: "0 1px 2px 0 hsl(var(--shadow-color) / 0.05)",
        elevated: "0 1px 2px 0 hsl(var(--shadow-color) / 0.06), 0 12px 32px -12px hsl(var(--shadow-color) / 0.18)",
        glow: "0 0 0 3px hsl(var(--ring) / 0.16)",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.8" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        float: "float 5s ease-in-out infinite",
        "float-delayed": "float 6s ease-in-out infinite 1.2s",
        "glow-pulse": "glow-pulse 3s ease-in-out infinite",
        "fade-up": "fade-up 0.32s cubic-bezier(0.22, 1, 0.36, 1) both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
