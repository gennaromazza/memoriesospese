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
      { find: "@/features/gift-cards/GiftCardPayPalButtons", replacement: path.join(stubs, "paypal-buttons.tsx") },
      { find: "@/components/gift-cards/GiftCardBookingBanner", replacement: path.join(stubs, "ui.tsx") },
      { find: "@/components/EmailSuggestionChip", replacement: path.join(stubs, "ui.tsx") },
      { find: "@/hooks/useSEO", replacement: path.join(stubs, "ui.tsx") },
      { find: "@/hooks/use-toast", replacement: path.join(stubs, "ui.tsx") },
      { find: "@/lib/analytics", replacement: path.join(stubs, "ui.tsx") },
      { find: "@/lib/booking-campaigns", replacement: path.join(stubs, "booking-services.ts") },
      { find: "@/lib/products", replacement: path.join(stubs, "booking-services.ts") },
      { find: "@/lib/bookings", replacement: path.join(stubs, "booking-services.ts") },
      { find: "@workspace/api-client-react", replacement: path.join(stubs, "api.ts") },
      { find: "@", replacement: src },
      { find: "@shared", replacement: path.resolve(app, "../../lib/shared-src") },
    ],
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: "127.0.0.1",
    port: Number(process.env.PORT || 4193),
    strictPort: true,
    fs: { strict: false },
  },
});
