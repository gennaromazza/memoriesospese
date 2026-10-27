---
name: Mockup WebGL browser testing
description: Reliable Playwright checks for mobile 3D mockup viewers embedded in same-origin iframes.
---

For mobile mockup E2E checks, wait in the parent page for the iframe viewer's ready state and target mode, then inspect its DOM and exercise a view control in one browser-side evaluation. Avoid many sequential `FrameLocator` assertions while WebGL initializes.

**Why:** Repeated cross-frame assertions made the mobile browser test exceed its timeout and close the iframe session, even though the 3D viewer rendered correctly. A single readiness wait and batched DOM check reduced the test to a stable run.

**How to apply:** Use this pattern when browser tests cover heavy 3D renderers inside same-origin iframes. Keep assertions on ready state, visible canvas/stage, read-only controls, and no writes.
