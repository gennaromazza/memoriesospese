# Browser verification: Windows gallery Job flow

Run from the workspace root:

```sh
pnpm run test:desktop-gallery-jobs
```

Playwright starts a **separate fixture server** on loopback port 4179 and stops it
after the test run. Override with `JOB_FLOW_E2E_PORT` if needed. It uses the
workspace's system Chromium when present, or Playwright's installed Chromium
otherwise. No login, database setup, API credentials, real gallery, or messages
are required.

## What runs

- The actual `NewGallery`, `GalleryWorkspace`, `GalleryAssociationFields`, UI
  controls, styles, association helpers and TanStack Query API hooks.
- Only the API transport module is replaced. Query loading, retry, mutation
  pending/error state, cache invalidation, navigation and component remounts
  remain real.
- Invented clients/Jobs/category data are kept in memory and sessionStorage in
  a fresh browser context per test. Reload tests re-read the fixture's saved
  gallery rather than carrying unsaved React state forward.
- Manual fixture controls support slow responses (2.5 seconds), failures and
  recovery for clients, Jobs, categories, creation and saving.

## Safety

The fixture has a separate HTML entry and Vite config; the normal desktop build
does not include a test route or an authentication bypass.

The transport allows only reads of fixture clients, Jobs, categories, galleries
and empty photo lists, plus creation/update of fixture galleries. All other
operations explicitly fail, including sharing, credentials and notifications.
It does not import the real API transport or initialize Firebase.

The browser test also blocks off-origin requests, HTTP writes, `/api/` requests
and direct imports of the real API/Firebase modules. The fixture itself denies
fetch, XHR, beacons and popup requests. No external fonts are loaded. Each test
attaches an audit of simulated calls and asserts that there are no network
violations, blocked application requests, unexpected endpoints or page errors.

## Verified scenarios

1. Creation, selecting/changing/removing a Job, required client locking, manual
   client preservation, automatic category changes, manual category protection,
   actual create payload and workspace navigation.
2. Settings save and overview refresh; reload/reopen with the saved Job,
   clients and category; removing a Job preserves existing clients; explicit
   client removal and category clearing persist (including null category payloads).
3. Loading, failures and **user-clicked retry** of Jobs, clients and categories.
   Saved Jobs show verification state, not a misleading missing-Job message;
   retry preserves the form and does not write to the saved gallery.
4. Creation/save failures retain edits without changing saved data. Retry
   succeeds; a slow save disables the submit control; reload displays the final
   saved values.

## Result and limitations

On 2026-10-03, all **3 Chromium browser tests passed** in 23.3 seconds.
Fixture audit: no external/backend traffic, client/Job writes, notifications,
unexpected endpoints or uncaught browser errors. An initial remote testing
service failed before executing; this result comes from local Playwright.

The browser was also visually inspected. The fixture explicitly includes the
desktop Tailwind sources so it renders with desktop spacing and control styles.

This verifies the Windows renderer's Job flow in Chromium, not the installed
Electron binary, native folder picker, live authentication, or Firebase/API
transaction implementation. Those are intentionally outside this isolated UI
check. Trace/failure screenshots and per-test audits are written to
`/tmp/image-studio-desktop-job-flow`, not committed to the repository.