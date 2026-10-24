---
name: Invoice client data editing
description: The invoice workflow edits the shared customer profile, not a temporary invoice-only copy.
---

**Rule:** When correcting customer details from an invoice flow, save them to the customer's shared profile and use the existing customer form and validation.

**Why:** The studio owner wants to fix incomplete billing details without leaving the job, and expects the corrected anagraphic data to remain current elsewhere in the studio.

**How to apply:** Reuse the canonical customer editor, refresh its client query after saving, and make clear that changes apply across the studio.
