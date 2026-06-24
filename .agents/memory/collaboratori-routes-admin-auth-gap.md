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
