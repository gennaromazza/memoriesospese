import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/memoriesospese/",
  
  plugins: [react()],
  
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "client", "src"),
      "@shared": path.resolve(process.cwd(), "shared"),
      "@assets": path.resolve(process.cwd(), "attached_assets"),
    },
  },

  root: path.resolve(process.cwd(), "client"),

  build: {
    outDir: path.resolve(process.cwd(), "dist", "memoriesospese"),
    emptyOutDir: true,
    // Chunk size optimizations
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks separati per ridurre bundle size
          'react-vendor': ['react', 'react-dom'],
          'firebase-vendor': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage', 'firebase/functions'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-select', '@radix-ui/react-tabs'],
          'stripe-vendor': ['@stripe/stripe-js'],
          'utils-vendor': ['date-fns', 'clsx', 'tailwind-merge', 'zod']
        }
      }
    }
  },
});