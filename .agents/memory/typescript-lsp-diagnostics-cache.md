---
name: Stale TypeScript language-server diagnostics
description: How to handle a TypeScript error that persists after the saved source and typecheck are clean.
---

**Rule:** When LSP reports an expression that no longer matches the saved file, run the artifact typecheck and inspect the reported line before changing logic again. If the typecheck passes and no matching error exists in saved source, refresh the editor or reopen the file.

**Why:** An LSP diagnostic persisted after the code was corrected and the web typecheck passed, repeatedly naming an older expression.

**How to apply:** Compare the exact LSP message and line with the current file contents. Prefer the compiler result for saved code; treat a mismatched LSP result as stale until the editor refreshes.
