import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  // 1) public path in produzione
  base:
    process.env.NODE_ENV === "production"
      ? (process.env.VITE_BASE_PATH || "/memoriesospese/")
      : "/",

  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: [".spock.replit.dev"],
  },

  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
  ],

  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },

  root: path.resolve(import.meta.dirname, "client"),

  build: {
    // 2) output in dist/memoriesospese
    outDir: path.resolve(import.meta.dirname, "dist", "memoriesospese"),
    emptyOutDir: true,
  },
});
