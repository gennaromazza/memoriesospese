---
name: Mockup download headless rendering
description: Headless SwiftShader can block the custodia mockup download while rendering its eight high-resolution WebGL previews.
---

Production export should reuse the viewer renderer, pause its animation loop while producing the eight previews, yield between views, and choose 1600×1200 normally or 800×600 for software/low-power hardware. The browser harness exercises this real path without a reduced-size flag. Async exports in embedded mockups must trigger the final anchor from the same-origin parent document so the sandbox does not suppress the download.

**Why:** SwiftShader can make synchronous high-resolution rendering monopolize the main thread, and an iframe loses download user activation after an async yield. Reusing the renderer, pausing competing frames, adaptive sizing, and parent-triggered downloads keep the UI responsive without weakening the normal export quality.

**How to apply:** Keep the high-quality 1600×1200 path for normal hardware and verify the eight-view report plus the lifecycle gate after changing any mockup renderer or download handler.

The GPU verification harness has two explicit modes: the default SwiftShader path checks the
800×600 fallback, while `PHOTOBOOK_REAL_GPU=1` disables software rasterization and requires a
real WebGL renderer before accepting an 1600×1200 report. A real Linux GPU may report a Mesa
driver, so Mesa alone must not be treated as software; identify software renderers such as
SwiftShader, llvmpipe, or softpipe instead.

**Why:** A broad Mesa match produces false low-resolution exports on hardware-accelerated Linux
drivers, while allowing fallback in the real-GPU mode would make the quality check a false
positive.

**How to apply:** Run the real-GPU mode on a machine with a visible browser/display and hardware
WebGL. In a headless or GPU-less runner, an unavailable viewer is an expected explicit failure,
not evidence for the 1600×1200 path.

The rotating viewers are separate export contracts: their reports embed JPEG previews, while the custodia report embeds PNG previews. A browser gate covering all rotating revisions must disable module caching between variants and provide any revision-local module imported through the shared fixture URL.

**Why:** reusing the iframe module can execute the previous revision, and assuming PNG-only output or a shared local import makes a passing viewer look broken (or skips the requested renderer).

**How to apply:** when extending the lifecycle harness, execute each viewer source explicitly, validate its own eight labels and JPEG/PNG dimensions, and keep the print-lock save rejection in every iteration.

Keep the parent download anchor mounted briefly after triggering it; immediate removal can race Chromium's download detection during a busy WebGL export.

**Why:** the same-origin parent trigger fixes iframe sandbox restrictions, but a synchronous remove can still lose the download event under load.

**How to apply:** use a short delayed cleanup for generated anchors and keep the browser gate watching the actual download event.

Animated WebGL canvases can keep Playwright element/page screenshots waiting for visual stability until timeout under SwiftShader. For a pixel-presence assertion, read the canvas with `toDataURL()` in the page; reserve screenshots for renderers whose animation loop is paused.

**Why:** disabling CSS animations does not stop a Three.js render loop, so screenshot stability checks can hang even when the renderer is healthy.

**How to apply:** use `canvas.toDataURL()` for close-up smoke checks, then validate the real downloaded report for its expected embedded preview count and per-renderer image format.