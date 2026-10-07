# Notifications and recovery fixtures

`notificationFixture=1` opts into a fully in-memory transport for the real order
manager and checkout components. `loginFixture=1` starts signed out; fixture login
changes only the local React authentication stub. Unrecognized API operations
are refused and no real email, payment, database or upload request is made.

Run the contact/recovery browser regression from the workspace root:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/repl/tools/bin/chromium pnpm exec playwright test --config artifacts/image-studio-web/e2e/print-deferred-harness/notifications.config.ts
```

Run the lifecycle-email status display checks (admin and buyer, isolated fixtures):

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$(command -v chromium)" pnpm exec playwright test --config artifacts/image-studio-web/e2e/print-deferred-harness/customer-status.config.ts
```

The checks cover list/detail contacts, legacy and international numbers, absent
or invalid contacts, URL-based recovery after login in a fresh browser, saved
Polaroid framing and contacts/delivery, explicit reminder opt-out, inaccessible
and expired orders, and already-paid order redirection. Fake-clock and server
ownership/payment tests live in the API test suite.

# Task 483 deferred payment UI harness

This standalone Vite/Playwright harness mounts the production
`PrintShopOrdersManager`/`DeferredPaymentPanel`, customer confirmation/orders
pages, `PrintShopOrderPage`, and `WhatsAppHelp`. Context, navigation/footer,
labs, address autocomplete, PayPal, Firebase and query-client dependencies are
isolated with local stubs. The test uses only in-memory HTTP fixtures and fails
any off-origin request; no Firebase login, persistent order, email, PayPal,
Drive, or publish operation is possible.

Run from the repository root:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$(command -v chromium)" \
pnpm exec playwright test \
  --config artifacts/image-studio-web/e2e/print-deferred-harness/playwright.config.ts
```

Playwright writes responsive screenshots under `screenshots/` and temporary
test results under `/tmp/image-studio-print-deferred-results`. The harness has
no production file or package manifest changes.