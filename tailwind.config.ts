import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const palette = (name: string) =>
  Object.fromEntries(
    [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((s) => [s, `rgb(var(--${name}-${s}) / <alpha-value>)`]),
  );
// Theme-aware palettes: values come from CSS variables that flip in .dark (see globals.css).
const palettes = Object.fromEntries(
  ["navy", "teal", "slate", "amber", "emerald", "red", "blue", "orange"].map((n) => [n, palette(n)]),
);

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1400px" } },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        arabic: ["var(--font-arabic)", "var(--font-sans)", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        ...palettes,
        status: {
          scheduled: "hsl(var(--status-scheduled))",
          arrived: "hsl(var(--status-arrived))",
          ready: "hsl(var(--status-ready))",
          current: "hsl(var(--status-current))",
          late: "hsl(var(--status-late))",
          finished: "hsl(var(--status-finished))",
          cancelled: "hsl(var(--status-cancelled))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        soft: "0 1px 2px rgb(17 28 51 / 0.04), 0 4px 16px -4px rgb(17 28 51 / 0.08)",
      },
      keyframes: {
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgb(17 163 153 / 0.45)" },
          "70%": { boxShadow: "0 0 0 10px rgb(17 163 153 / 0)" },
          "100%": { boxShadow: "0 0 0 0 rgb(17 163 153 / 0)" },
        },
      },
      animation: { "pulse-ring": "pulse-ring 2s infinite" },
    },
  },
  plugins: [animate],
};

export default config;
