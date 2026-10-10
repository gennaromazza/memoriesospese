---
name: Google all-day events are transparent by default
description: Why a transparency/"Libero" filter must exempt all-day events, or day-blocks silently disappear from availability.
---

# Google all-day events default to transparency: 'transparent'

When fetching Google Calendar events to compute busy/conflict periods, any filter
that drops `transparency === 'transparent'` ("Libero") events MUST exempt all-day
events (`!!event.start?.date`). Compute `isAllDay` BEFORE the transparency check
and only skip transparent events when `!isAllDay`.

**Why:** Google all-day events (single OR multi-day) are created as `transparent`
by default. A blanket transparency filter therefore silently discarded full-day
blocks (e.g. a wedding marked all-day), so they never blocked consultation/booking
slots — a confusing, hard-to-spot bug because the events looked present in the
calendar UI but vanished from the availability computation. The photographer
expects ANY all-day event = day occupied. Timed transparent events should still be
filtered (those really are "free/busy=free").

**How to apply:** The fetch in `server/google-calendar.ts` is shared by both
consultations and bookings — fixing it once corrects both. When debugging "an
event on the calendar isn't blocking slots", check the transparency filter and
whether the event is all-day first.
