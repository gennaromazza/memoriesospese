import { defineConfig } from "vitest/config";

// Eseguita dal comando firebase emulators:exec: le regole richiedono gli
// emulatori Firestore e Storage e non devono rendere fragile la suite normale.
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "firebase-rules.test.ts",
      "server/functions-email-queue.firestore.test.ts",
    ],
    globals: false,
    clearMocks: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
