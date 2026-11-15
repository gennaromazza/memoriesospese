---
name: Quote color contrast warnings
description: Product rule for readability checks on quote theme palettes.
---

# Quote color contrast warnings are informative only

**Rule:** Quote theme readability warnings must calculate contrast using the actual text and rendered background colors, including transparency. They inform the studio owner but must not adjust colors, save settings, or block saving a low-contrast palette.

**Why:** The owner explicitly requires control over the quote palette; the warning should expose a readability risk without silently changing that choice or preventing its use.

**How to apply:** Recompute the warning from unsaved color-picker values as they change. Keep it separate from invalid-color validation, and preserve already-saved quote theme snapshots.
