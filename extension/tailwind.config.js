/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        confidence: {
          high: "#16a34a",
          medium: "#ca8a04",
          low: "#dc2626",
        },
      },
    },
  },
  plugins: [],
};
