---
name: Validated .replit replacement
description: How to change the protected Replit deployment configuration safely.
---

Direct edits to `.replit` are rejected by the environment. Prepare the complete replacement in an untracked temporary file inside the workspace, then call `verifyAndReplaceDotReplit` with its absolute path; clean up the temporary file afterward.

**Why:** The replacement helper validates the configuration schema before applying it, while direct edits can be blocked or leave unrelated section changes.

**How to apply:** Preserve the current file contents and section order when building the temporary replacement. Use a uniquely named temporary path rather than a tracked legacy file such as `.replit.new`.