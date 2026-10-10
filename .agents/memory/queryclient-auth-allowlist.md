---
name: queryClient Firebase auth allowlist
description: New authenticated /api route families must be registered in queryClient's prefix allowlist or every call 401/403s.
---

# queryClient Firebase auth allowlist

`client/src/lib/queryClient.ts` does NOT attach the Firebase ID token to every
`/api` request. Both `apiRequest` and `getQueryFn` carry a hardcoded
`firebaseAuthEndpoints` array of URL-prefix substrings; the `Authorization:
Bearer <token>` header is only added when the request URL matches one of them.

**Rule:** when you add a new server route family protected by
`authenticateFirebase` (admin or otherwise), you MUST add its prefix (e.g.
`/api/labs`, `/api/lab-shipments`) to the `firebaseAuthEndpoints` list in
`apiRequest`. Without it the call ships with no token and the server replies
401/403 — the UI looks "broken" with no obvious cause.

**Why:** the allowlist is opt-in by prefix, not default-on. A brand-new route
family silently falls through as unauthenticated. This blocked an entire admin
feature end-to-end until the prefix was added.

**How to apply:** client libs that hit a new authed route via `apiRequest` work
only after the prefix is registered. `getQueryFn` has its own (shorter) list;
most authed reads in this codebase use explicit `queryFn` wrappers that call
`apiRequest`, so the `apiRequest` list is the one that matters in practice — but
add to both if you rely on the default query fetcher.
