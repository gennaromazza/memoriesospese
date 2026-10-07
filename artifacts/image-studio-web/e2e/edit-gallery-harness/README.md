# Gallery save regression checks

This standalone harness renders the real `EditGalleryModal` with normal React
hooks and UI. Firestore and Storage are replaced by local in-memory adapters;
the browser rejects off-origin traffic and every non-read network request.
Credentials are fixture-only and assertions return booleans rather than secrets.
The mock toast callback has the same stable identity as the production callback,
so missing save callback dependencies are not hidden by unnecessary rerenders.

Run from the repository root:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$(command -v chromium)" \
pnpm exec playwright test \
  --config artifacts/image-studio-web/e2e/edit-gallery-harness/playwright.config.ts
```

Omit the executable override when Playwright's bundled Chromium is installed.
The dedicated Vite config is not used by the production app.