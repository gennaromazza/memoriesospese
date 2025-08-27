
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig(({ mode }) => {
  // Carica le variabili d'ambiente per la modalità corrente
  const env = loadEnv(mode, process.cwd(), '');
  
  // Determina il base path in base all'ambiente
  const basePath = mode === 'production' 
    ? (env.VITE_BASE_PATH || '/memoriesospese/')  // Fallback per sicurezza
    : '/';
  
  // Determina il nome della cartella di output per production
  const outputSubfolder = mode === 'production' && basePath !== '/'
    ? basePath.replace(/^\/|\/$/g, '') // Rimuove slash iniziali/finali
    : 'app'; // Fallback generico
  
  return {
    // Base path dinamico
    base: basePath,

    server: {
      host: "0.0.0.0",
      port: 5000,
      allowedHosts: [".spock.replit.dev"],
    },

    plugins: [
      react(),
      runtimeErrorOverlay(),
      ...(mode !== "production" && process.env.REPL_ID !== undefined
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
      // Output dinamico: dist/memoriesospese per production, dist/app per development
      outDir: path.resolve(import.meta.dirname, "dist", outputSubfolder),
      emptyOutDir: true,
      
      // Assicura che gli asset siano referenziati correttamente
      assetsDir: "assets",
      
      // Migliora la compatibilità del bundle
      target: "esnext",
      minify: mode === "production" ? "esbuild" : false,
    },

    // Definisci variabili d'ambiente disponibili al client
    define: {
      __VITE_BASE_PATH__: JSON.stringify(basePath),
      __APP_MODE__: JSON.stringify(mode),
    },

    // Ottimizzazioni per il build
    optimizeDeps: {
      include: ["react", "react-dom", "firebase/app", "firebase/firestore"],
    },
  };
});
