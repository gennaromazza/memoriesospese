---
name: Quote builder dialog lifecycle
description: Test controlled dialog close/reopen separately from dismissing an unsaved-change warning.
---

For quote edit lifecycle tests, distinguish rejecting the unsaved-change warning from the parent closing and reopening the controlled dialog. Rejecting the warning keeps the dialog open; parent-driven close/reopen is the path that verifies draft hydration does not overwrite the current form state.

**Why:** The builder's open state belongs to its parent, and the unsaved-change prompt is a separate decision from external dialog lifecycle changes.

**How to apply:** When changing quote hydration, refetch behavior, or close handling, cover both the warning decision and an actual parent-controlled close/reopen in an authenticated browser test.
