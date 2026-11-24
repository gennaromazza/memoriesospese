---
name: Studio settings as the source of truth
description: Durable rule for studio identity and quote branding.
---

**Rule:** Quote colors and footer name come from saved Admin Studio settings. Templates cannot override the global quote theme. Newly created quotes must not use code or template fallbacks; existing quote documents retain their saved theme unless the owner explicitly requests a change.

**Why:** The owner explicitly requires studio-specific data to be managed in Admin Studio rather than hardcoded.

**How to apply:** When changing quote or template creation and display flows, read the saved Studio settings and use their quote theme and studio name. Palette values may seed unsaved settings fields, but missing saved configuration must not silently fall back at runtime.
