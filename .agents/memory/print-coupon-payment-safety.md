---
name: Print coupon payment safety
description: Distinguish coupon validation before capture from recording money already captured.
---

Validate current coupon conditions before requesting payment capture. Once the provider confirms capture, reconcile against the order's frozen reservation and amount, not the coupon's current editable terms.

**Why:** A coupon edit or expiration during the provider request must not leave a genuinely paid order recorded as unpaid. Admin edits to coupon terms are blocked while live checkout reservations exist, but payment reconciliation must also tolerate changes outside that path.

**How to apply:** Preserve the distinction in payment callbacks and webhook recovery. Count only live reservations toward capacity; never subtract an expired reservation from another customer's active usage.
