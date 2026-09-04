---
name: Quill image alt attributes
description: Quill’s built-in image format supports alt and preserves it in the editor Delta.
---

Use Quill’s native `alt` image format when inserting or editing article images; formatting the selected embed keeps the attribute through later editor changes. Keep the HTML sanitizer configured to retain `alt`.

**Why:** Storing the value only in a temporary URL-to-alt map would lose existing descriptions as soon as Quill re-emits its HTML after an edit.

**How to apply:** For new embeds, insert the image and format the one-character embed with `alt`; for existing images, select the embed and apply the same format. Use a map only as a save-time compatibility fallback.