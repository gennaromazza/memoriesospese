---
name: Resend contact segment schema
description: Prefer current Resend endpoint documentation to stale connector-generated parameter summaries.
---

For Resend API payloads, verify nested structures against current endpoint documentation rather than relying only on generated integration summaries. Segment membership is separate from the global contact record: list a segment’s contacts, then remove membership with `DELETE /contacts/{contactId}/segments/{segmentId}`; do not delete the contact. Segment names can be migrated with `PATCH /segments/{id}`.

**Why:** Connector summaries have been stale: contact creation requires segment objects containing IDs, while membership removal and segment renaming have dedicated endpoints. Deleting a contact to clear a segment would remove the global contact record and could disrupt other segments or consent history.

**How to apply:** Keep regression tests for nested request objects and use paginated segment contact lists before clearing membership. Preserve contacts and topic subscriptions; use mocked provider calls for broadcast tests so no real campaign is sent.
