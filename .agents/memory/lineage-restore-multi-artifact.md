---
name: Linea di codice corretta = multi-artifact (artifacts/, lib/, pnpm)
description: Il progetto vero è la struttura pnpm multi-artifact; la struttura single-app client/ server/ shared/ è una base vecchia (1 set 2026) da non ripristinare
---
La linea di codice valida è quella multi-artifact: `artifacts/api-server`, `artifacts/image-studio-web`, `artifacts/image-studio-desktop`, `lib/shared-src`, workspace pnpm, workflow gestiti dagli artifact.toml (API su 8080, web su 23767). Contiene API desktop (`/api/desktop`), passkey admin (`/api/admin/security`), gift card.

**Why:** l'8 ott 2026 un "riallineamento" ha riportato il workspace a una base del 1° settembre (layout `client/ server/ shared/`, npm, un unico Dev Workflow). Per 2 giorni si è lavorato e pubblicato da lì: gallerie desktop in errore, passkey e gift card "sparite". Nessun attacco: solo base sbagliata. Ripristinato il 10 ott dal ramo `feature/gift-card` sul ramo `restore/completo-20261010` (anche su GitHub).

**How to apply:** se il workspace mostra `client/`+`server/` alla radice, o manca `pnpm-workspace.yaml`, è la base sbagliata: fermarsi e ripartire dal ramo di ripristino. Le correzioni fatte sulla base vecchia (9–10 ott) sono state riportate solo in parte: la serie Real Wedding cover e la gestione consulenze/fusi non sono state riportate perché questa linea le gestisce già diversamente (consultation-datetime, createEuropeRomeDate, social-metadata). Push a GitHub: via API Git Data del connector, leggendo i file dentro la funzione impure (il notebook ha 32 MiB di memoria). `.migration-backup/functions*/src` serve a 4 test ma non era tracciato: ripristinato dal commit scaffold 985f38ae.
