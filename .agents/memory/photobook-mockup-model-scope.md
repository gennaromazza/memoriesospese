---
name: Photobook mockup model scope
description: The album model is chosen at photobook level and inherited by every version, with multiple-model offers as an explicit exception.
---

The normal photobook flow has one fixed laboratory/model selection stored at photobook level. Versions inherit it; version-scoped offer documents are compatibility and history data, not independent model assignments.

**Why:** Reassigning the model separately for each version made the studio workflow ambiguous and could present the customer with choices that had already been decided.

**How to apply:** Keep the fixed-model path as the default in admin and customer UI. Use the explicit choice mode only when the studio intentionally publishes multiple models; preserve legacy per-version offers while migrating.

For customer-facing multi-model offers, use the approved mobile-first progressive chooser: a vertical, data-driven model list followed by a separate cover-style step.

**Why:** The studio expects the catalog to grow; a vertical progressive flow remains understandable with more models, while a one-card carousel hides comparison and scales poorly.

**How to apply:** Render every active catalog option without hardcoded positions, keep touch targets and the primary action obvious on phones, and reveal cover styles only after a model is selected.