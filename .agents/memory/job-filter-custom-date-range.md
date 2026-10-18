---
name: Job custom date-range picker
description: Keep admin job range filters inclusive and their two-month calendar usable in a popover.
---

Treat the selected final calendar date as inclusive by comparing against its local end of day. For a two-month React DayPicker inside a Radix popover, constrain each month to a fixed width; an unconstrained full-width flex month grid can create a multi-million-pixel popover and put later dates outside the viewport.

**Why:** Browser testing exposed both a late event on the selected end date being excluded at midnight and an unbounded two-month calendar layout that prevented selecting the second date.

**How to apply:** When changing the admin JobsManager date-range filter or reusing its two-month calendar in a popover, preserve inclusive end-of-day semantics and verify day cells remain clickable in a real browser.
