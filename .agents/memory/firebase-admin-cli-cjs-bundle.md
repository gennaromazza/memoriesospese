---
name: Firebase Admin CLI bundle
description: Import the API server Firebase Admin helper from one-off scripts without ESM/CommonJS interop failures
---
Rule: For one-off Admin SDK scripts, bundle the existing `firebase-admin.ts` entry point to temporary CommonJS with esbuild and require that bundle; do not rely on direct `tsx` ESM named imports.
**Why:** Direct `tsx`/ESM imports can expose Firebase Admin named exports as undefined even though the API server's normal build works; an esbuild CommonJS bundle successfully initialized the same helper.
**How to apply:** Build to an ignored temporary file under the API package's `dist/`, require it from the script, and remove all temporary bundles afterward. Never print credential values.
