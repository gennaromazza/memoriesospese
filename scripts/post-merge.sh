#!/bin/bash
set -euo pipefail
pnpm install --frozen-lockfile

# Do not contact or mutate the database for merges that did not change its schema.
# Keep schema changes on the non-forced path: data-loss operations must not be
# auto-approved by a post-merge job.
if git rev-parse --verify HEAD^ >/dev/null 2>&1 &&
   git diff --quiet HEAD^ HEAD -- lib/db/src/schema lib/db/drizzle.config.ts; then
  echo "No database schema changes in merged commit; skipping database push."
else
  pnpm --filter @workspace/db run push
fi
