import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  // Base path dinamico
  const basePath = mode === "production" ? env.VITE_BASE_PATH || "/" : "/";
  const outputSubfolder =
    mode === "production" && basePath !== "/"
      ? basePath.replace(/^\/|\/$/g, "")
      : "app";

  const plugins = [react(), runtimeErrorOverlay()];

  return {
    base: basePath,
    root: path.resolve(import.meta.dirname, "client"),

    server: {
      host: "0.0.0.0",
      port: 5173,
      allowedHosts: true,
    },

    plugins,

    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "client", "src"),
        "@shared": path.resolve(import.meta.dirname, "shared"),
        "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      },
    },

    build: {
      outDir: path.resolve(import.meta.dirname, "dist", outputSubfolder),
      emptyOutDir: true,
      assetsDir: "assets",
      target: "esnext",
      minify: mode === "production" ? "esbuild" : false,

      // 🔹 Aumenta limite per i warning (solo informativo)
      chunkSizeWarningLimit: 3000,

      // 🔹 Spezzamento manuale dei chunk principali
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom"],
            firebase: [
              "firebase/app",
              "firebase/auth",
              "firebase/firestore",
              "firebase/storage",
            ],
            vendor: [
              "react-router-dom",
              "@tanstack/react-query",
              "axios",
              "zod",
            ],
          },
        },
      },
    },

    define: {
      __VITE_BASE_PATH__: JSON.stringify(basePath),
      __APP_MODE__: JSON.stringify(mode),
    },

    // 🔹 Pre-bundling di dipendenze critiche per evitare warning sui dynamic imports
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "firebase/app",
        "firebase/auth",
        "firebase/firestore",
        "firebase/storage",
      ],
    },
  };
});
