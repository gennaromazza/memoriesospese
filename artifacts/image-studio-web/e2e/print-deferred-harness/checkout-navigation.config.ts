import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: "checkout-navigation.spec.ts",
  outputDir: "/tmp/image-studio-print-checkout-navigation-results",
});
