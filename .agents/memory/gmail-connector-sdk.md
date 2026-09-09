---
name: Gmail connector SDK and account separation
description: Invio Gmail via proxy SDK e distinzione tra account mittente, admin Firebase e calendario Service Account
---

Il server deve usare `@replit/connectors-sdk` con il proxy `google-mail`; il recupero manuale dell'access token tramite `/api/v2/connection` può funzionare in sviluppo ma restituire 401 in produzione quando usa `WEB_REPL_RENEWAL`.

**Why:** la connessione Gmail può essere sana e appena riautorizzata, mentre il token di deployment usato dal percorso raw viene rifiutato; il proxy SDK gestisce identità e refresh correttamente.

**How to apply:** per inviare o leggere Gmail usare `/gmail/v1/...` tramite proxy autenticato, senza leggere, loggare o cache-are token. Gmail mittente, utente admin Firebase e calendario Google possono essere identità distinte.