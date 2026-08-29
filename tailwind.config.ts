import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  future: {
    hoverOnlyWhenSupported: true,
  },
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        /* sans/display resolve through the CSS font tokens in index.css
				   (Inter + Schibsted Grotesk — the chosen Racing Green pairing). */
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
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        /* Semantic status tones — see the --tone-* block in index.css.
				   Each exposes `text-<tone>`, `bg-<tone>-bg` and
				   `border-<tone>-border` so status styling never hardcodes a
				   raw Tailwind palette step. */
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
        special: {
          DEFAULT: "hsl(var(--tone-special))",
          bg: "hsl(var(--tone-special-bg))",
          border: "hsl(var(--tone-special-border))",
        },
        neutral: {
          DEFAULT: "hsl(var(--tone-neutral))",
          bg: "hsl(var(--tone-neutral-bg))",
          border: "hsl(var(--tone-neutral-border))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
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
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "collapsible-down": {
          from: { height: "0" },
          to: { height: "var(--radix-collapsible-content-height)" },
        },
        "collapsible-up": {
          from: { height: "var(--radix-collapsible-content-height)" },
          to: { height: "0" },
        },
        shrink: {
          from: { width: "100%" },
          to: { width: "0%" },
        },
        /* Lean sheet keyframes — transform-only for iOS Safari GPU compositing */
        "sheet-in-left": {
          from: { transform: "translate3d(-100%, 0, 0)" },
          to: { transform: "translate3d(0, 0, 0)" },
        },
        "sheet-out-left": {
          from: { transform: "translate3d(0, 0, 0)" },
          to: { transform: "translate3d(-100%, 0, 0)" },
        },
        "sheet-in-right": {
          from: { transform: "translate3d(100%, 0, 0)" },
          to: { transform: "translate3d(0, 0, 0)" },
        },
        "sheet-out-right": {
          from: { transform: "translate3d(0, 0, 0)" },
          to: { transform: "translate3d(100%, 0, 0)" },
        },
        "sheet-in-top": {
          from: { transform: "translate3d(0, -100%, 0)" },
          to: { transform: "translate3d(0, 0, 0)" },
        },
        "sheet-out-top": {
          from: { transform: "translate3d(0, 0, 0)" },
          to: { transform: "translate3d(0, -100%, 0)" },
        },
        "sheet-in-bottom": {
          from: { transform: "translate3d(0, 100%, 0)" },
          to: { transform: "translate3d(0, 0, 0)" },
        },
        "sheet-out-bottom": {
          from: { transform: "translate3d(0, 0, 0)" },
          to: { transform: "translate3d(0, 100%, 0)" },
        },
        "sheet-overlay-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "sheet-overlay-out": {
          from: { opacity: "1" },
          to: { opacity: "0" },
        },
        /* Smooth loading dots — transform-only (GPU composited), no layout thrashing */
        "dot-bounce": {
          "0%, 100%": { transform: "translateY(0)", opacity: "1" },
          "50%": { transform: "translateY(-6px)", opacity: "0.7" },
        },
        /* Indeterminate progress strip — a 1/3-wide bar that slides L->R repeatedly.
				   Used on the non-blocking validate indicator (BrandValidation page). */
        "progress-slide": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(300%)" },
        },
        /* Sign-in column entrance - opacity/transform only, runs once. */
        "auth-rise": {
          from: { opacity: "0", transform: "translate3d(0, 10px, 0)" },
          to: { opacity: "1", transform: "translate3d(0, 0, 0)" },
        },
        /* Walkthrough "press this" beat. A halo that expands and fades
				   out of the control, plus a small lift on the control itself,
				   so the eye lands on the one button the step is asking for.
				   box-shadow rather than a pseudo-element so it can be dropped
				   onto an existing button with one class. */
        "tour-beat": {
          "0%": { transform: "scale(1)", boxShadow: "0 0 0 0 rgba(21, 81, 53, 0.55)" },
          "55%": { transform: "scale(1.08)", boxShadow: "0 0 0 12px rgba(21, 81, 53, 0)" },
          "100%": { transform: "scale(1)", boxShadow: "0 0 0 0 rgba(21, 81, 53, 0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        "accordion-up": "accordion-up 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        "collapsible-down": "collapsible-down 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        "collapsible-up": "collapsible-up 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
        shrink: "shrink 5s linear",
        "progress-slide": "progress-slide 1.4s ease-in-out infinite",
        /* Sheet slides — Apple-style easing, transform-only for smooth iOS */
        "sheet-in-left": "sheet-in-left 0.28s cubic-bezier(0.32, 0.72, 0, 1) both",
        "sheet-out-left": "sheet-out-left 0.2s cubic-bezier(0.32, 0.72, 0, 1) both",
        "sheet-in-right": "sheet-in-right 0.28s cubic-bezier(0.32, 0.72, 0, 1) both",
        "sheet-out-right": "sheet-out-right 0.2s cubic-bezier(0.32, 0.72, 0, 1) both",
        "sheet-in-top": "sheet-in-top 0.28s cubic-bezier(0.32, 0.72, 0, 1) both",
        "sheet-out-top": "sheet-out-top 0.2s cubic-bezier(0.32, 0.72, 0, 1) both",
        "sheet-in-bottom": "sheet-in-bottom 0.28s cubic-bezier(0.32, 0.72, 0, 1) both",
        "sheet-out-bottom": "sheet-out-bottom 0.2s cubic-bezier(0.32, 0.72, 0, 1) both",
        "sheet-overlay-in": "sheet-overlay-in 0.28s ease-out both",
        "sheet-overlay-out": "sheet-overlay-out 0.2s ease-in both",
        "dot-bounce": "dot-bounce 0.8s ease-in-out infinite",
        "auth-rise": "auth-rise 0.4s cubic-bezier(0.22, 1, 0.36, 1) both",
        "tour-beat": "tour-beat 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
