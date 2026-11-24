---
name: Dev Workflow has no server hot-reload
description: Compiled API workflows need rebuilding; temporary environment overrides also require process restoration.
---

# Server changes need a managed workflow restart

Do not assume that editing server source updates the API process. Check the
current managed workflow: compiled services need their normal rebuild/restart.
Vite hot reload only proves that client changes are being served.

**Why:** Verifying server behavior right after an edit can mislead you: logs/endpoints
still reflect the previous build. This caused a near-misread when checking the
all-day transparency fix — the sync log still showed old filtering.

**How to apply:** Restart the exact artifact-owned API workflow before probing
changed routes. Do not introduce a parallel server or change its run command
just to obtain hot reload.

## Vite can remain healthy after a failed artifact restart

An artifact workflow may report a port-in-use failure while its previous Vite
process is still serving the configured port and applying HMR updates. Check the
actual listener, HTTP response, and browser HMR log before attempting another
restart; do not launch a parallel dev server.

**Why:** A restart attempt failed because port `23767` was already occupied, even
though the web preview was returning HTTP 200 and receiving client updates.

**How to apply:** For artifact Vite workflows, compare the workflow log with the
artifact's configured port and verify the existing process before restarting.

## Temporary environment overrides outlive the configuration change

Removing a temporary `NODE_OPTIONS` preload does not remove it from processes
already running with that environment.

**Why:** an isolated route smoke check used an outbound-network guard. Other
development services inherited the temporary override, and dynamic frontend
imports failed until those processes were restarted without it.

**How to apply:** avoid broad environment overrides where possible. When one is
necessary, record the original workflow states, stop the guarded API before
removing the override, restore the configuration, and restart affected running
frontend services. Do not restart an API with real workers merely to restore
its environment if it was originally stopped.
