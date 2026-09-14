---
name: Photobook fabric texture sampling
description: Fabric maps are small tiled assets; stochastic color sampling must not be reused for bump data.
---

Use stochastic phase blending only for the fabric color map. Sample the height/bump map with the normal filtered UVs and attenuate its strength as the texture footprint becomes sub-pixel.

**Why:** Applying random per-cell offsets to the height map produces visible dots, false cavities, and block boundaries even when the color repetition is less obvious.

**How to apply:** Keep the shared fabric shader helper in sync across active photobook renderers, preserve mipmaps and anisotropy, and validate on a real WebGL/GPU runner because software/headless contexts may not create the renderer.