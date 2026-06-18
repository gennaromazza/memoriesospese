---
name: Gallery public access gate blocks direct testing
description: Why /view/:id shows the global 404 when screenshot/e2e tools open it directly, and how to test it.
---

# Galleria pubblica: gate d'accesso e test diretto

Aprire `/view/:id` (componente Gallery) DIRETTAMENTE con screenshot tool o e2e mostra la **404 globale** (`pages/NotFound.tsx`, "Pagina non trovata"), anche se la galleria esiste e viene trovata.

**Perché:** un effetto in Gallery controlla `localStorage['gallery_auth_<id>']`; se manca e l'utente non è admin, fa `navigate('/access/<id>')` — ma `/access/:id` **non è una route registrata** (esistono solo `/gallery/:id` e `/view/:id`), quindi cade sul catch-all → 404. Vale per OGNI galleria (anche senza password), perché in uso reale il flag viene impostato passando prima da `/gallery/:id`.

**Come testare la griglia:** impostare `localStorage.setItem('gallery_auth_<id>','true')` (su un'origine valida, es. dopo aver caricato `/`) PRIMA di navigare a `/view/<id>`. Per gallerie senza password `hasValidAccess` è già true, quindi la griglia si renderizza subito dopo il bypass del gate. Lo screenshot tool non può impostare localStorage → usare l'e2e (Playwright) con page.evaluate.

**Why:** ho perso diversi tentativi a credere fosse una regressione del refactor masonry; era invece comportamento pre-esistente del gate.

**Nota infra:** il runner e2e (`runTest`) può fallire con status `unable` e "password authentication failed for user 'neondb_owner'" — è un problema del harness (prova a connettersi a Neon), non del progetto, che usa Firebase. È transitorio/ambientale.
