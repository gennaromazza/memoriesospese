import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, "../..");

export default defineConfig({
  root: here,
  base: "/",
  define: {
    __VITE_BASE_PATH__: JSON.stringify("/"),
    __APP_MODE__: JSON.stringify("test"),
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.join(app, "src"),
      "@shared": path.resolve(app, "../../lib/shared-src"),
    },
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: "127.0.0.1",
    port: Number(process.env.PORT || 4182),
    strictPort: true,
    proxy: process.env.VITE_API_PROXY_TARGET
      ? {
          "/api": {
            target: process.env.VITE_API_PROXY_TARGET,
            changeOrigin: true,
          },
        }
      : undefined,
    fs: { strict: false },
  },
});
