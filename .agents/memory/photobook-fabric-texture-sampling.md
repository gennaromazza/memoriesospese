---
name: Photobook fabric texture sampling
description: Fabric maps are small tiled assets; mirrored repeat and conservative bump filtering avoid visible tiling artifacts.
---

Use mirrored-repeat sampling for both fabric color and height maps. Keep the height/bump map on normal filtered UVs and attenuate its strength as the texture footprint becomes sub-pixel.

**Why:** Random per-cell offsets produced visible bands, dots, and false cavities in the real mockup screenshot, while a mirrored repeat keeps the texture continuous at tile boundaries.

**How to apply:** Keep the shared fabric helper in sync across active photobook renderers, use mirrored wrapping with mipmaps and anisotropy, and validate on a real WebGL/GPU runner because software/headless contexts may not create the renderer.