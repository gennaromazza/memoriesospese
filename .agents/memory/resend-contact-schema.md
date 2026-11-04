---
name: Resend contact segment schema
description: Prefer current Resend endpoint documentation to stale connector-generated parameter summaries.
---

For Resend API payloads, verify nested structures against current endpoint documentation rather than relying only on generated integration summaries.

**Why:** The connector summary described contact segments as strings, but the live API and official documentation require objects containing an ID. The older representation causes a 422 during contact preparation, before broadcast creation.

**How to apply:** Keep regression tests for nested request objects. Use mocked provider calls for broadcast tests; invalid-request probes must not create contacts, broadcasts, or send real email.
