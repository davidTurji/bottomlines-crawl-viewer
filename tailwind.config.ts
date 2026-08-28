import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

// Copied from bottomlines-app to guarantee same look/feel.
export default {
  future: { hoverOnlyWhenSupported: true },
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: { center: true, padding: "2rem", screens: { "2xl": "1400px" } },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["DM Mono", "ui-monospace", "SFMono-Regular", "monospace"],
        display: ["var(--font-display)"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        ok: {
          DEFAULT: "hsl(var(--tone-ok))",
          bg: "hsl(var(--tone-ok-bg))",
          border: "hsl(var(--tone-ok-border))",
        },
        warn: {
          DEFAULT: "hsl(var(--tone-warn))",
          bg: "hsl(var(--tone-warn-bg))",
          border: "hsl(var(--tone-warn-border))",
        },
        critical: {
          DEFAULT: "hsl(var(--tone-critical))",
          bg: "hsl(var(--tone-critical-bg))",
          border: "hsl(var(--tone-critical-border))",
        },
        info: {
          DEFAULT: "hsl(var(--tone-info))",
          bg: "hsl(var(--tone-info-bg))",
          border: "hsl(var(--tone-info-border))",
        },
        neutral: {
          DEFAULT: "hsl(var(--tone-neutral))",
          bg: "hsl(var(--tone-neutral-bg))",
          border: "hsl(var(--tone-neutral-border))",
        },
      },
      backgroundImage: {
        "gradient-primary": "var(--gradient-primary)",
        "gradient-dark": "var(--gradient-dark)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
