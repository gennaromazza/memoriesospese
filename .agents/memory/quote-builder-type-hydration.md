---
name: QuoteBuilder type hydration in StrictMode
description: Preserve per-product selectable values when a quote or template programmatically changes quote type.
---

# Programmatic quote-type changes must preserve product selectable snapshots

When loading a quote or template, the type-change effect must skip only when it
observes the intended target type. Do not use a one-shot boolean that is
consumed by a StrictMode effect replay while React Hook Form still exposes the
previous type; that makes the later real transition reset every custom product
to the type default and loses its saved Fisso/Extra choice.

**Why:** Browser testing showed a saved `selectable: false` product became
selectable after edit hydration, even though the form loader preserved the
explicit value. React StrictMode reran the effect before the reset's target
type appeared.

**How to apply:** Any programmatic type update paired with per-product
selectability must retain the expected type as the skip condition. Recheck
hydration and template loading in a StrictMode browser test whenever this
effect changes.
