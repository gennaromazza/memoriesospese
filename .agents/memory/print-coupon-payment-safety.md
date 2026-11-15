---
name: Print coupon payment safety
description: Distinguish coupon validation before capture from recording money already captured.
---

Validate current coupon conditions before requesting payment capture. Once the provider confirms capture, reconcile against the order's frozen reservation and amount, not the coupon's current editable terms.

**Why:** A coupon edit or expiration during the provider request must not leave a genuinely paid order recorded as unpaid. Admin edits to coupon terms are blocked while live checkout reservations exist, but payment reconciliation must also tolerate changes outside that path.

**How to apply:** Preserve the distinction in payment callbacks and webhook recovery. Count only live reservations toward capacity; never subtract an expired reservation from another customer's active usage.

Recalculating an unchanged print checkout must preserve both the pending provider order and the awaiting-payment state; these cannot be preserved independently.

**Why:** A retry can reuse the same PayPal order after recalculation. Keeping its ID while resetting fulfillment to draft makes the final capture reject an otherwise payable checkout.

**How to apply:** Keep the states consistent in the same transaction. Changed quotes must still invalidate the old provider binding; never relax capture guards to accept arbitrary drafts.
