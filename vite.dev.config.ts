import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig(async () => {
  const plugins = [react(), runtimeErrorOverlay()];
  
  // Aggiungi il plugin cartographer solo in development su Replit
  if (process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined) {
    const { cartographer } = await import("@replit/vite-plugin-cartographer");
    plugins.push(cartographer());
  }

  return {
    // Usa il percorso base dal file .env
    base: process.env.NODE_ENV === "production" 
      ? (process.env.VITE_BASE_PATH || "/memoriesospese/")
      : "/",

    server: {
      host: "0.0.0.0",
      port: 5000,
      allowedHosts: [".spock.replit.dev"],
    },

    plugins,

    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "client", "src"),
        "@shared": path.resolve(import.meta.dirname, "shared"),
        "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      },
    },

    root: path.resolve(import.meta.dirname, "client"),

    build: {
      outDir: path.resolve(import.meta.dirname, "dist", "memoriesospese"),
      emptyOutDir: true,
    },
  };
});