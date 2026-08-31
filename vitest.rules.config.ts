import { defineConfig } from "vitest/config";

// Eseguita dal comando firebase emulators:exec: le regole richiedono gli
// emulatori Firestore e Storage e non devono rendere fragile la suite normale.
export default defineConfig({
  test: {
    environment: "node",
    include: ["firebase-rules.test.ts"],
    globals: false,
    clearMocks: true,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
