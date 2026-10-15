import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        // Docker exposes the API through Nginx, not host port 3001.
        // For a native backend: DEV_API_TARGET=http://127.0.0.1:3001
        target: process.env.DEV_API_TARGET ?? "http://127.0.0.1:8080/api",
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api/, ""),
        proxyTimeout: 150_000,
      },
    },
  },
});
