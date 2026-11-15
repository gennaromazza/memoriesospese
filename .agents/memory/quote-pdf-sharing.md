---
name: Sharing signed quote PDFs
description: Safe, durable sharing links for client-signed quotes and their browser-generated PDFs.
---

**Rule:** Treat browser-generated PDF `blob:` URLs as temporary and local to that browser context. For a durable share link, use the signed quote portal at `/quote/:token`; send the downloaded PDF itself as an attachment when the recipient needs the file.

**Why:** A `blob:` URL is not a server-hosted PDF and cannot be opened on another device. Uploading a contract to an unprotected public path to make that URL permanent could expose sensitive client data.

**How to apply:** Keep PDF generation client-side unless protected persistent storage is designed. When adding sharing controls, copy the canonical signed-portal URL rather than the current PDF/blob address.
