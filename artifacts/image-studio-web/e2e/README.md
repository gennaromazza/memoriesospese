# Date selector browser test

Run the quote, payment, and job date-selector checks from the workspace root:

```sh
pnpm exec playwright install chromium
pnpm test:date-selectors
```

The test starts a separate Vite dev server on `127.0.0.1:4178` (override with
`DATE_PICKER_E2E_PORT`). It enables a development-only route at
`/admin/__e2e/date-selectors`; that route is absent in production builds. The
The harness mounts the real quote builder, payment-plan, installment, payment,
and job modals with fixture IDs and dates. It seeds the required queries locally
instead of reading Firestore. The public quick-quote page uses a fixed API
fixture.

Each test uses a new Playwright browser context with no saved cookies,
`storageState`, or production account. The browser route policy aborts all
off-origin requests (including Firebase) and all non-GET/HEAD requests. Local
calendar-conflict reads receive a fixed empty response. The tests select dates
and close the dialogs without pressing either save/register button, and fail if
the network guard observes a local write. External traffic is aborted.

This setup tests the selectors and form-field updates without production data,
Firebase access, payment registration, or job changes.