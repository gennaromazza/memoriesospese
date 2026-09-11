---
name: Mockup download headless rendering
description: Headless SwiftShader can block the custodia mockup download while rendering its eight high-resolution WebGL previews.
---

The browser harness must use a reduced export size for the custodia download check; production downloads retain the full 1600×1200 previews.

**Why:** SwiftShader renders the eight synchronous export frames slowly enough that Playwright can time out after the click even though the browser received it.

**How to apply:** Keep the reduced-size branch behind the harness-only flag. If production export performance changes, recheck both the real 1600×1200 output and the browser lifecycle gate.