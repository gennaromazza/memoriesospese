---
name: Mockup iframe styling
description: Visual rules for the photobook wizard are injected into each renderer iframe, not inherited from the parent app.
---

The photobook wizard controls and step panel render inside the same-origin renderer iframe. Styles for `body[data-wizard]`, wizard steps, view controls, and state-specific summaries must be added to the stylesheet injected by `installMockupWizard`; the parent page CSS only affects the outer shell and admin panel. A sandbox preview can look complete while the real iframe remains legacy if this boundary is missed.

**Why:** Browser iframe boundaries prevent the main application's stylesheet from reaching the renderer document, so a redesign can appear correct in the shell while leaving the actual controls unchanged.

**How to apply:** Keep outer layout rules in `mockup-mobile.css` and renderer-document rules in `mockup-wizard-layout.ts`, pass read-only/confirmed state into the iframe, and verify both the main page and the iframe preview with a real same-origin harness.