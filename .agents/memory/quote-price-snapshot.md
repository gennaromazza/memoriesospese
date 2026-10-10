---
name: Quote price snapshot vs catalog
description: Why quote creation must trust the admin/template price snapshot and never re-fetch catalog prices.
---

# Quote prices are an admin-decided snapshot, not a live catalog read

**Rule:** When a quote (preventivo) is created, the price stored on each
`quote.products[].prezzo` is the snapshot the admin intends — it already encodes
any per-template price OVERRIDE (badge "modificato") and OMAGGIO (0). Quote
creation must NOT re-read the catalog product and replace that price with the
catalog list price. The only catalog lookup allowed at creation time is an
existence check for referential integrity. Force `prezzo = 0` when `isOmaggio`.

**Why:** A previous "trusted price" re-fetch in quote creation overwrote the
admin's override with the catalog price, so templates configured with discounted
prices produced quotes at full list price (the client saw the wrong, higher
prices). The override is an intentional business decision, not tampering.

**Why it was not a real security control:** quote creation runs in admin-only
client code, and signature/acceptance already trusts the stored snapshot. The
re-fetch only "protected" against the admin's own UI — i.e. it destroyed exactly
the override the admin wanted. Real anti-tampering lives in Firestore rules and
in keeping the signer unable to author pricing fields.

**How to apply:** Any quote-building path must keep template/builder overrides
intact end-to-end: template save → load into builder → merge → create → public
view → accept. The server "Preventivo Rapido" path already does this (uses
template `p.prezzo` directly); keep all paths consistent. Discounts are computed
separately (validate then `calculateQuoteTotals`) and never re-derive item prices
from the catalog.
