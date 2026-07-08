---
name: Caricamento dati Firestore nei modal
description: I modal sempre montati non devono caricare dati Firestore al mount ma all'apertura (isOpen)
---

**Regola:** nei modal montati in modo permanente (es. da AdminDashboard), i fetch Firestore (job types, jobs, ecc.) vanno in un effect gated su `isOpen`, non in `useEffect [] ` al mount.

**Why:** al mount della pagina l'auth Firebase può non essere ancora pronta → le query fallisono silenziosamente (catch → console.error) e le liste (es. dropdown categorie) restano vuote, sembrando un campo "non impostabile". EditGalleryModal usa già il pattern corretto; NewGalleryModal è stato corretto dopo un bug segnalato dall'utente.

**How to apply:** `useEffect(() => { if (!isOpen) return; fetch...(); }, [isOpen])` — così i dati si ricaricano anche a ogni apertura.
