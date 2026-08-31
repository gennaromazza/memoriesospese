import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig(({ mode }) => {
  // Vite resolves import.meta.env relative to `root` (client/). Load the
  // configuration from that same directory so the asset base and the router
  // can never be compiled from two different .env files.
  const clientRoot = path.resolve(import.meta.dirname, "client");
  const env = loadEnv(mode, clientRoot, "");

  // Base path dinamico
  const basePath = mode === "production" ? env.VITE_BASE_PATH || "/" : "/";
  const outputSubfolder =
    mode === "production" && basePath !== "/"
      ? basePath.replace(/^\/|\/$/g, "")
      : "app";

  const plugins = [react(), runtimeErrorOverlay()];

  return {
    base: basePath,
    root: clientRoot,
    envDir: clientRoot,

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
      chunkSizeWarningLimit: 1000,

      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules")) {
              if (id.includes("react-dom") || id.includes("/react/")) {
                return "react";
              }
              if (id.includes("firebase/")) {
                return "firebase";
              }
              if (id.includes("recharts") || id.includes("d3-")) {
                return "charts";
              }
              if (id.includes("framer-motion")) {
                return "framer";
              }
              if (id.includes("xlsx")) {
                return "xlsx";
              }
              if (id.includes("@ckeditor")) {
                return "ckeditor";
              }
              if (id.includes("react-pdf") || id.includes("pdfjs-dist")) {
                return "pdf";
              }
              if (id.includes("@dnd-kit")) {
                return "dndkit";
              }
              if (id.includes("luxon")) {
                return "luxon";
              }
              if (id.includes("@radix-ui")) {
                return "radix";
              }
              if (id.includes("embla-carousel")) {
                return "carousel";
              }
              if (
                id.includes("@tanstack/react-query") ||
                id.includes("axios") ||
                id.includes("zod") ||
                id.includes("wouter") ||
                id.includes("clsx") ||
                id.includes("tailwind-merge") ||
                id.includes("class-variance-authority")
              ) {
                return "vendor";
              }
            }
          },
        },
      },
    },

    define: {
      __VITE_BASE_PATH__: JSON.stringify(basePath),
      __APP_MODE__: JSON.stringify(mode),
    },

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
