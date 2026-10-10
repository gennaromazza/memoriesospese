---
name: collaboratori-routes admin auth gap
description: Most admin routes in server/collaboratori-routes.ts enforce only login, not admin role — pre-existing privilege-escalation gap.
---

# collaboratori-routes admin auth gap

In `server/collaboratori-routes.ts` the admin CRUD/management routes are guarded
**only** by `authenticateFirebase` (any logged-in Firebase user), NOT by an admin
or ownership check. `ADMIN_EMAILS` was declared but went completely unused.

**Impact:** any authenticated Firebase user could invoke admin operations
(create/edit collaborators, change compensi, add/mark payments, generate
dashboard tokens, update montaggio status & trigger emails) just by knowing or
guessing a document id.

**Status:** a `requireAdmin` middleware now exists in this file and is applied to
the montaggio PATCH route. The other admin routes here still need it. The
token-based PUBLIC routes (`/collaboratori/public/...` and
`/collaboratori/dashboard/:token`) must stay unguarded — they are intentionally
public.

**Why it matters:** the project owner explicitly prioritizes fixing auth
inconsistencies. The canonical pattern is `requireAdmin` (same shape as the one
in `server/lab-routes.ts`): check `ADMIN_EMAILS.includes(req.user?.email)` → 403.

**How to apply:** when touching any admin route in this file, add
`requireAdmin` after `authenticateFirebase`. Do NOT add it to the public
token-based routes.

## Systemic sweep (resolved)
The same `authenticateFirebase`-only gap existed in many `server/*-routes.ts`.
Now CLOSED: every admin route in job/backup/import/calendar/reminder/bulk-email/
payment-schedule/admin/receipt-routes has `requireAdmin`, and
order-routes `/payment-received-notification` got an inline admin check.
Canonical pattern everywhere: `ADMIN_EMAILS.includes(req.user?.email)` → 403.
In this app any Firebase-authenticated request is effectively an admin (clients &
collaborators use token-based public routes), so any `authenticateFirebase` route
is admin-only by design.

## STILL OPEN — booking-routes.ts (separate, more severe)
`server/booking-routes.ts` admin routes (approve/reject/status/update/delete/
calendar-event/resend-confirmation-emails) have NO auth middleware at all and
the client (`client/src/lib/bookings.ts`) calls them via raw `fetch` WITHOUT an
Authorization header (no global fetch patch). Securing them needs a coordinated
client+server change (send the Firebase token / switch to `apiRequest`), so it's
a dedicated follow-up, NOT a drop-in `requireAdmin`.
