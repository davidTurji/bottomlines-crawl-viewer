import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5181,
    proxy: {
      "/api": {
        // Dev-proxy upstream only. Deliberately NOT VITE_API_BASE: that
        // var is the browser-side fetch base and must stay "/api" so
        // requests are same-origin and the httpOnly session cookie
        // sticks. Point VITE_PROXY_TARGET at the crawler API instead.
        target: process.env.VITE_PROXY_TARGET || "http://localhost:8000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
