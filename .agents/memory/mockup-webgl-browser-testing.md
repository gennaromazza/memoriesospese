---
name: Mockup WebGL browser testing
description: Reliable Playwright checks for mobile 3D mockup viewers embedded in same-origin iframes.
---

For mobile mockup E2E checks, wait in the parent page for the iframe viewer's ready state and target mode, then inspect its DOM and exercise a view control in one browser-side evaluation. Avoid many sequential `FrameLocator` assertions while WebGL initializes.

**Why:** Repeated cross-frame assertions made the mobile browser test exceed its timeout and close the iframe session, even though the 3D viewer rendered correctly. A single readiness wait and batched DOM check reduced the test to a stable run.

**How to apply:** Use this pattern when browser tests cover heavy 3D renderers inside same-origin iframes. Keep assertions on ready state, visible canvas/stage, read-only controls, and no writes.

When the phone wizard is on its final step and the 3D view is open, the full-screen stage must override both the final-step height and any wizard-injected stage positioning. Assert that the stage fills the iframe viewport and that its controls receive pointer hits after portrait → landscape → portrait resizing.

**Why:** Landscape testing exposed a stage reduced to the final summary's 58dvh height, allowing the gesture guide to cover the view controls even though the ready flag and 3D classes remained set.

**How to apply:** Keep full-screen 3D rules aligned in the shared phone stylesheet and the injected wizard mobile stylesheet. Add the final-step state to mobile orientation regression checks.
