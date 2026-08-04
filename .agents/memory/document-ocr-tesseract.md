---
name: OCR documenti con Tesseract locale
description: scelte e trucchi per la scansione tessera sanitaria/CIE senza servizi a pagamento
---

# OCR documenti: Tesseract locale, niente OpenAI

**Regola:** la scansione documenti usa `tesseract.js` sul server (gratis, nessun invio a terzi). L'utente ha rifiutato esplicitamente soluzioni a pagamento (OpenAI aveva credito esaurito e non vuole ricaricare).

**Why:** richiesta esplicita dell'utente ("vorrei un sistema gratuito"); privacy migliore (immagine mai fuori dal server).

**How to apply / trucchi appresi:**
- L'OCR confonde O/0, I/1 ecc. e incolla etichette al codice: il CF va cercato con finestre scorrevoli di 16 (e 17 con rimozione di un char) validate col **checksum**, con coercizione lettera↔cifra per posizione (`findCodiceFiscale` in shared/document-ocr.ts).
- Data di nascita e sesso si decodificano dal CF stesso (gestire omocodia), più affidabile della lettura OCR delle date.
- Nome/cognome: riconosciuti confrontando le parole OCR coi codici a 3 lettere del CF (escludere parole-etichetta e sottostringhe del CF).
- Worker Tesseract riusato tra richieste; `cachePath: '/tmp/tesseract-cache'` altrimenti scarica `ita.traineddata` nella root del repo (gitignorato `*.traineddata`).
- Route protetta con `requireAdmin` (email allowlist) oltre a `authenticateFirebase` — richiesto da code review per PII e abuso.

# Places: CAP per città
`places:searchText` include `postal_code` SOLO per città a CAP unico (Milano/Roma → assente): perfetto per compilare il CAP senza indovinare; per alcune città piccole può comunque mancare (es. Grumo Nevano) → degradare senza errore.
