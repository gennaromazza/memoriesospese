import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, "../../");
const src = path.join(app, "src");
const stubs = path.join(here, "stubs");

export default defineConfig({
  root: here,
  define: {
    __VITE_BASE_PATH__: JSON.stringify("/"),
    __APP_MODE__: JSON.stringify("test"),
  },
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@/lib/queryClient", replacement: path.join(stubs, "queryClient.ts") },
      { find: "@/lib/firebase", replacement: path.join(stubs, "firebase.ts") },
      { find: "./firebase", replacement: path.join(stubs, "firebase.ts") },
      { find: "@/hooks/use-toast", replacement: path.join(stubs, "use-toast.ts") },
      { find: "firebase/firestore", replacement: path.join(stubs, "firestore.ts") },
      { find: "firebase/storage", replacement: path.join(stubs, "storage.ts") },
      { find: "@", replacement: src },
      { find: "@shared", replacement: path.resolve(app, "../../lib/shared-src") },
    ],
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: "127.0.0.1",
    port: Number(process.env.PORT || 4191),
    strictPort: true,
    fs: { strict: false },
  },
});
