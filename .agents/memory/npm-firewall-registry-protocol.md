---
name: NPM firewall registry protocol
description: Recover Node dependencies safely when package lock URLs and the Replit package firewall disagree.
---

Keep `npm install` out of the Dev Workflow. If an interrupted install leaves package directories empty or npm reports `ENOTEMPTY`, regenerate `node_modules` from the lockfile in one explicit recovery step using registry-host replacement.

**Why:** Installing while the server starts can leave partially renamed package folders. This environment reaches its internal package firewall over HTTP, while lockfiles may retain HTTPS tarball hosts; older dependency versions can also be blocked by the firewall.

**How to apply:** First update direct parents or supported overrides for blocked packages. Then run a clean lockfile-based install with `replace-registry-host=always`, verify the required runtime imports, and restart the workflow. Do not bypass the firewall or add an install command back to the workflow.

In this workspace, `protobufjs@7.5.4` is a direct root dependency whose metadata is available but whose tarball is denied by the Socket Security Policy (Critical CVE). The firewall’s HTTP endpoint is reachable, while npm’s plain lockfile resolution can rewrite the URL to HTTPS and report `ECONNREFUSED`. Without changing the lockfile or obtaining a firewall exception, no compatible local cache may exist.