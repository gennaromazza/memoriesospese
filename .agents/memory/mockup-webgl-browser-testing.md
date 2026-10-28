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

For persistence flows that mutate a photo or camera state, pause the viewer's animation loop in the test URL and assert the loaded texture plus view state rather than drawing repeatedly between interactions.

**Why:** Repeated software-WebGL rendering can make headless iframe interactions extremely slow; the scene's assigned texture and camera direction are testable independently of another framebuffer draw.

**How to apply:** Keep the pause hook test-only. Confirm the rear-photo texture is loaded and the view is correct after selection and restoration; production rendering remains unchanged.

Desktop tests based on a mobile Playwright device must override the physical `screen`, `hasTouch`, and user agent as well as `viewport`; otherwise physical-screen phone detection can still render the mobile wizard.

**Why:** A wide viewport alone did not clear Pixel-device screen emulation, so a test labeled desktop exercised the phone gallery and save path instead.

**How to apply:** When a suite defaults to a phone device, explicitly set desktop screen dimensions and input capabilities for desktop-only cases that depend on `usePhoneOrientation`.
