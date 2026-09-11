---
name: Mockup download headless rendering
description: Headless SwiftShader can block the custodia mockup download while rendering its eight high-resolution WebGL previews.
---

Production export should reuse the viewer renderer, pause its animation loop while producing the eight previews, yield between views, and choose 1600×1200 normally or 800×600 for software/low-power hardware. The browser harness exercises this real path without a reduced-size flag. Async exports in embedded mockups must trigger the final anchor from the same-origin parent document so the sandbox does not suppress the download.

**Why:** SwiftShader can make synchronous high-resolution rendering monopolize the main thread, and an iframe loses download user activation after an async yield. Reusing the renderer, pausing competing frames, adaptive sizing, and parent-triggered downloads keep the UI responsive without weakening the normal export quality.

**How to apply:** Keep the high-quality 1600×1200 path for normal hardware and verify the eight-view report plus the lifecycle gate after changing any mockup renderer or download handler.