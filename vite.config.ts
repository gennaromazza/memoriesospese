import { defineConfig, loadEnv, type UserConfigExport } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig(
  async ({ mode }: { mode: string }): Promise<UserConfigExport> => {
    const env = loadEnv(mode, process.cwd(), "");

    const basePath = env.VITE_BASE_PATH || "/";

    const outputSubfolder =
      mode === "production" && basePath !== "/"
        ? basePath.replace(/^\/|\/$/g, "")
        : "app";

    const plugins = [react(), runtimeErrorOverlay()];

    return {
      base: basePath,
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
        outDir: path.resolve(import.meta.dirname, "dist", outputSubfolder),
        emptyOutDir: true,
        assetsDir: "assets",
        target: "esnext",
        minify: mode === "production" ? "esbuild" : false,
      },
      define: {
        __VITE_BASE_PATH__: JSON.stringify(basePath),
        __APP_MODE__: JSON.stringify(mode),
      },
      optimizeDeps: {
        include: ["react", "react-dom", "firebase/app", "firebase/firestore"],
      },
    };
  },
);
