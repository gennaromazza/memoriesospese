---
name: Browser → Google Drive resumable upload CORS
description: Why browser chunk uploads to a Drive resumable session URI fail with CORS, and the server-side fix.
---

# Browser → Google Drive resumable upload CORS

Direct browser → Google Drive resumable uploads (lab "Invio Laboratorio
Stampa") need the resumable **session** to be initiated with an `Origin` header
matching the browser origin. Google only adds `Access-Control-Allow-Origin` to
the session URI responses (and answers the preflight for `Content-Range`) when
that initiation request carried `Origin`. Without it, the chunk `PUT`s from the
browser fail with "blocked by CORS policy: No 'Access-Control-Allow-Origin'".

**Why:** the session URI is minted server-side (the OAuth token must never reach
the browser), so the server-to-Google initiation call is what Google inspects to
decide CORS — not the later browser PUTs.

**How to apply:**
- Server reads the browser origin from `req.headers.origin` on the
  `/upload-session` request and passes it to `createResumableUploadSession`,
  which sets it as the `Origin` header on the initiation POST.
- Node's global `fetch` (undici) **does** forward a manually-set `Origin` header
  (verified) — unlike browsers, it does not strip forbidden headers. So no need
  for a different HTTP client.
- Do NOT proxy the upload bytes through Express (defeats the multi-GB direct
  upload design). The Origin header is the whole fix.
