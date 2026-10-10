---
name: NPM firewall registry protocol
description: Recover Node dependencies safely when package lock URLs and the Replit package firewall disagree.
---

Keep `npm install` out of the Dev Workflow. If an interrupted install leaves package directories empty, executable links missing, or npm reports rename errors, regenerate `node_modules` from the lockfile in one explicit recovery step using registry-host replacement. The presence of a package directory alone does not prove that dependency is installed.

**Why:** Installing while the server starts can leave partially renamed package folders. This environment reaches its internal package firewall over HTTP, while lockfiles may retain HTTPS tarball hosts; older dependency versions can also be blocked by the firewall.

**How to apply:** First update direct parents or supported overrides for blocked packages, preferring compatible patch releases. Refresh locked transitive dependencies within their supported ranges when an older locked tarball is denied. Then run a clean lockfile-based install with `replace-registry-host=always`, verify executable links and required runtime imports, and restart the workflow. Do not bypass the firewall or add an install command back to the workflow.

Firewall package decisions change over time: inspect the currently denied tarball and current registry metadata rather than assuming a package version blocked in an earlier session is still the blocker.