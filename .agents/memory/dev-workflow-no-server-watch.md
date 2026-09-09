---
name: Dev Workflow has no server hot-reload
description: Server-side edits require a manual workflow restart; only the client hot-reloads.
---

# Server changes need a manual workflow restart

The `Dev Workflow` runs `tsx server/index.ts` (no `tsx watch`/nodemon). Editing any
server file (e.g. `server/**`) does NOT reload the running server — the old code
keeps serving. Only the Vite-served client hot-reloads on edit.

**Why:** Verifying server behavior right after an edit can mislead you: logs/endpoints
still reflect the previous build. This caused a near-misread when checking the
all-day transparency fix — the sync log still showed old filtering.

**How to apply:** After any server-side change, call `restart_workflow("Dev Workflow")`
before testing endpoints or reading logs to confirm new behavior. Don't edit
package.json scripts (forbidden) to add watch — just restart.

In development, the Preview root opens the admin login; the production server keeps the public home at `/`.

**Why:** the everyday workflow is admin-centric, but the public homepage must remain unchanged for deployment and SEO.

**How to apply:** keep the redirect development-only and route-specific; do not add a global redirect that affects production or API paths.
