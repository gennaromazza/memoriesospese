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
  define: { __VITE_BASE_PATH__: JSON.stringify("/"), __APP_MODE__: JSON.stringify("test") },
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@/context/FirebaseAuthContext", replacement: path.join(stubs, "auth.tsx") },
      { find: "@/context/StudioContext", replacement: path.join(stubs, "studio.tsx") },
      { find: "@/components/Navigation", replacement: path.join(stubs, "shell.tsx") },
      { find: "@/components/Footer", replacement: path.join(stubs, "footer.tsx") },
      { find: "@/hooks/useSEO", replacement: path.join(stubs, "seo.ts") },
      { find: "@/hooks/use-toast", replacement: path.join(stubs, "toast.ts") },
      { find: "@/lib/firebase", replacement: path.join(stubs, "firebase.ts") },
      { find: "../lib/firebase", replacement: path.join(stubs, "firebase.ts") },
      { find: "./firebase", replacement: path.join(stubs, "firebase.ts") },
      { find: "../lib/auth", replacement: path.join(stubs, "auth-service.ts") },
      { find: "@/lib/queryClient", replacement: path.join(stubs, "queryClient.ts") },
      { find: "@/lib/labs", replacement: path.join(stubs, "labs.ts") },
      { find: "@/components/places/AddressAutocompleteInput", replacement: path.join(stubs, "AddressAutocompleteInput.tsx") },
      { find: "@/features/print-shop/PayPalCheckout", replacement: path.join(stubs, "PayPalCheckout.tsx") },
      { find: "firebase/firestore", replacement: path.join(stubs, "firestore.ts") },
      { find: "firebase/auth", replacement: path.join(stubs, "firebase-auth.ts") },
      { find: "firebase/storage", replacement: path.join(stubs, "storage.ts") },
      { find: "firebase/app", replacement: path.join(stubs, "firebase-app.ts") },
      { find: "firebase/functions", replacement: path.join(stubs, "firebase-functions.ts") },
      { find: "firebase/analytics", replacement: path.join(stubs, "firebase-analytics.ts") },
      { find: "@/lib", replacement: src + "/lib" },
      { find: "@", replacement: src },
      { find: "@shared", replacement: path.resolve(app, "../../lib/shared-src") },
    ],
    dedupe: ["react", "react-dom"],
  },
  server: { host: "127.0.0.1", port: Number(process.env.PORT || 4192), strictPort: true, fs: { strict: false } },
});