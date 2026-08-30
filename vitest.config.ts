import { defineConfig } from "vitest/config";

// Standalone Vitest config (takes precedence over vite.config.ts, which is
// left untouched as it is required by the Vite/React dev server setup).
// Run with: npx vitest run
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "server/**/*.test.ts",
      "shared/**/*.test.ts",
      "client/src/config/**/*.test.ts",
      "client/src/lib/wedding-seo.test.ts",
      "client/src/pages/admin/adminGalleryFilters.test.ts",
    ],
    globals: false,
    clearMocks: true,
  },
});
