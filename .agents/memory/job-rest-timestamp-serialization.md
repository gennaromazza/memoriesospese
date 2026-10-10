---
name: Job REST API timestamp serialization
description: Job data fetched via REST (getJob / GET /api/jobs/:id) returns Firestore Admin Timestamps as {_seconds,_nanoseconds}, not Timestamp objects.
---

# Job REST API timestamp serialization

`client/src/lib/jobs.ts#getJob` fetches via `apiRequest('GET', '/api/jobs/:id')`, and that route just spreads `jobDoc.data()` into `res.json()`. Firebase Admin `Timestamp` values therefore arrive on the client serialized as `{ _seconds, _nanoseconds }` — they do NOT have a `.toDate()` method. The same applies to nested timestamps inside `workflowEvents[].data`.

**Rule:** when rendering any timestamp that came from a jobs REST endpoint, convert it with `convertFirestoreTimestamp` from `@/lib/firebase` (handles `.toDate()`, `seconds`, `_seconds`, Date, and ISO string). Do not call `.toDate()` directly.

**Why:** calling `.toDate()` on a `{_seconds}` object is a no-op/crash and silently drops the date from the UI (e.g. "Inviato" with no date). An architect review caught exactly this on the consulenza-visione status card.

**How to apply:** any new client code consuming `getJob`/job list REST data. Note some older spots (e.g. parts of JobDetailDrawer that call `job.eventDate.toDate()`) are latent-fragile for the same reason — prefer the helper if you touch them.
