# Mappa tecnica di Memorie Sospese

> Riferimento architetturale collegato al
> [Piano di consolidamento](./PIANO-CONSOLIDAMENTO-PIATTAFORMA.md).

## Vista generale

```mermaid
flowchart TB
  Users[Clienti e ospiti] --> Public[Sito pubblico]
  Admin[Gennaro / amministratore] --> AdminPwa[PWA Studio Admin]
  Staff[Collaboratori] --> Collab[Portale collaboratori]

  Public --> Frontend[Frontend React + Vite]
  AdminPwa --> Frontend
  Collab --> Frontend

  Frontend --> FirebaseAuth[Firebase Auth]
  Frontend --> Firestore[(Firestore)]
  Frontend --> Storage[(Firebase Storage)]
  Frontend --> Api[API Express / Node]

  Api --> Firestore
  Api --> Storage
  Api --> Calendar[Google Calendar]
  Api --> Email[Email / Gmail / SMTP]
  Api --> Drive[Google Drive Backup]
  Api --> Places[Google Places]
  Api --> Aruba[XML FatturaPA / Aruba]

  GitHub[GitHub main] --> Replit[Replit build e hosting]
  Replit --> Frontend
  Replit --> Api
```

## Esperienze utente

```mermaid
flowchart LR
  Homepage[Homepage] --> Portfolio[Portfolio]
  Homepage --> Blog[Blog e video]
  Homepage --> Booking[Prenotazioni e consulenze]
  Homepage --> GalleryAccess[Accesso gallerie]

  GalleryAccess --> Gallery[Galleria]
  Gallery --> Selection[Selezione foto]
  Gallery --> Comments[Commenti e note vocali]
  Gallery --> Questionnaire[Questionari]

  Booking --> Quote[Preventivo]
  Quote --> Contract[Contratto e firma]
  Contract --> Job[Lavoro]
  Job --> Payments[Pagamenti]
  Payments --> Invoice[Fattura XML]
```

## Pannello amministrativo

```mermaid
flowchart TB
  Dashboard[Admin Dashboard]
  Dashboard --> Agenda[Agenda]
  Dashboard --> Jobs[Lavori e clienti]
  Dashboard --> Galleries[Gallerie]
  Dashboard --> Communication[Comunicazione e sito]
  Dashboard --> Finance[Cassa e pagamenti]
  Dashboard --> Settings[Impostazioni]
  Dashboard --> Assistant[Assistente]

  Jobs --> Quotes[Preventivi e contratti]
  Jobs --> Invoices[Fatture e ricevute]
  Jobs --> Collaborators[Collaboratori]
  Jobs --> Labs[Laboratori e prodotti]

  Galleries --> Photos[Foto e miniature]
  Galleries --> Selections[Selezioni]
  Galleries --> Questionnaires[Questionari]

  Communication --> Email[Email e campagne]
  Communication --> Blog[Blog]
  Communication --> Seo[Homepage e SEO]

  Settings --> Studio[Identità e dati fiscali]
  Settings --> Slideshow[Slideshow]
  Settings --> Integrations[Calendar e Gmail]
  Settings --> Backup[Backup e migrazioni]
```

## Gruppi API principali

| Prefisso | Responsabilità | Accesso atteso |
| --- | --- | --- |
| `/api/email` | email operative, notifiche e log | misto: pubblico controllato/admin |
| `/api/booking` | disponibilità e prenotazioni | misto: pubblico/admin |
| `/api/orders` | ordini e prodotti | admin/cliente autorizzato |
| `/api/jobs` | lavori e clienti | admin |
| `/api/payment-schedules` | scadenze e pagamenti | admin |
| `/api/quotes` | preventivi, contratti e firme | misto con token |
| `/api/import` | importazioni | admin |
| `/api/consultations` | consulenze e calendario | misto: pubblico/admin |
| `/api/calendar` | gestione Google Calendar | admin |
| `/api/receipts` | ricevute | admin |
| `/api/places` | ricerca indirizzi | pubblico limitato/admin |
| `/api/products` | catalogo prodotti | lettura pubblica/scrittura admin |
| `/api/migrations` | migrazioni dati | admin |
| `/api/admin` | manutenzione amministrativa | admin |
| `/api/galleries` | operazioni galleria | pubblico controllato/admin |
| `/api/bulk-email` | campagne email | admin |
| `/api/reminders` | promemoria | admin/scheduler |
| `/api/backup` | esportazione e ripristino | admin |
| `/api/audit` | integrità dati | admin |
| `/api/gdpr` | richieste privacy | misto controllato |
| `/api/studio-assistant` | assistente operativo | admin |
| `/api/info-forms` | moduli informativi | token/admin |
| `/api/photobooks` | revisione fotolibri | token/admin |

La colonna “Accesso atteso” è una specifica da verificare durante l'audit, non
la certificazione dello stato attuale.

## Domini dei dati

| Dominio | Entità principali | Sensibilità |
| --- | --- | --- |
| Identità | utenti, ruoli, token | alta |
| Studio | impostazioni, dati fiscali, social | media/alta |
| Clienti | anagrafica, contatti, indirizzi | alta |
| Lavori | eventi, stati, note, allegati | alta |
| Finanza | pagamenti, fatture, ricevute | molto alta |
| Gallerie | foto, password, PIN, selezioni | alta |
| Booking | richieste, disponibilità, appuntamenti | alta |
| Contratti | preventivi, firme, PDF | molto alta |
| Collaboratori | incarichi, compensi, token | alta |
| Comunicazioni | email, log, campagne | alta |
| Contenuti | homepage, portfolio, blog, video | pubblica |
| Sistema | backup, audit, lock, rate limit | molto alta |

## Confini di sicurezza

```mermaid
flowchart LR
  Internet[Internet] --> PublicApi[API pubbliche limitate]
  Internet --> TokenApi[API protette da token monouso]
  FirebaseUser[Utente Firebase] --> UserApi[API utente autenticato]
  FirebaseAdmin[Admin Firebase] --> AdminApi[API amministrative]
  Scheduler[Scheduler interno] --> InternalApi[Processi interni]

  PublicApi --> Validation[Validazione + rate limit]
  TokenApi --> TokenValidation[Verifica token e scadenza]
  UserApi --> Ownership[Verifica proprietario]
  AdminApi --> AdminRole[Verifica ruolo admin]
  InternalApi --> ServiceIdentity[Identità del servizio]

  Validation --> Data[(Dati)]
  TokenValidation --> Data
  Ownership --> Data
  AdminRole --> Data
  ServiceIdentity --> Data
```

## Integrazioni esterne

| Servizio | Utilizzo | Credenziale | Rischio principale |
| --- | --- | --- | --- |
| Firebase Auth | autenticazione | configurazione Firebase | autorizzazioni incomplete |
| Firestore | database | Admin SDK/client SDK | regole troppo permissive |
| Firebase Storage | immagini e allegati | regole Storage | lettura o upload impropri |
| Google Calendar | agenda e appuntamenti | service account/OAuth | chiave scaduta o eventi duplicati |
| Gmail/SMTP | email | account/app password | invii duplicati o quota |
| Google Drive | backup | service account/OAuth | backup non ripristinabile |
| Google Places | indirizzi | API key | quota o chiave esposta |
| Aruba | import XML fatture | nessun collegamento diretto | XML non conforme |
| Replit | esecuzione e deploy | Secrets | ambienti non allineati |
| GitHub | codice e Pull Request | token GitHub | merge senza controlli |

## Flusso di pubblicazione desiderato

```mermaid
flowchart LR
  Change[Modifica locale] --> Branch[Branch codex/*]
  Branch --> Tests[Test e build]
  Tests --> PR[Pull Request]
  PR --> CI[GitHub Actions]
  CI -->|OK| Main[Merge in main]
  CI -->|Errore| Fix[Correzione]
  Fix --> Tests
  Main --> Pull[git pull su Replit]
  Pull --> Preview[Verifica Preview]
  Preview --> Publish[Republish]
  Publish --> Smoke[Smoke test produzione]
```

## Flussi critici da proteggere con test

| ID | Flusso | Priorità |
| --- | --- | --- |
| F01 | login e logout amministratore | P0 |
| F02 | creazione e modifica cliente | P1 |
| F03 | creazione e modifica lavoro | P1 |
| F04 | preventivo, firma e contratto | P1 |
| F05 | piano pagamenti, acconto e saldo | P1 |
| F06 | creazione, download ed eliminazione fattura XML | P1 |
| F07 | prenotazione e sincronizzazione Calendar | P1 |
| F08 | creazione, accesso ed eliminazione galleria | P1 |
| F09 | selezione foto e questionario cliente | P1 |
| F10 | incarico e risposta collaboratore | P1 |
| F11 | invio email e promemoria | P1 |
| F12 | backup e ripristino | P0 |
| F13 | modifica homepage e slideshow | P2 |
| F14 | installazione PWA admin | P2 |

## Punti di attenzione iniziali

Questi elementi richiedono verifica prioritaria negli emulatori e nei test:

- funzione provvisoria `hasValidToken()` nelle regole Firestore;
- lettura pubblica di risposte e bozze dei questionari;
- accesso pubblico a validation session, rate limit e distributed lock;
- distinzione tra API realmente pubbliche e operazioni amministrative;
- utilizzo del flag locale `isAdmin` solo come stato UI, mai come autorizzazione;
- documenti Firestore contenenti campi legacy o `undefined`;
- componenti molto grandi e accoppiati;
- assenza iniziale di controlli GitHub obbligatori.

## Procedura di aggiornamento della mappa

Aggiornare questo documento quando:

- viene aggiunto un gruppo API;
- nasce una nuova integrazione esterna;
- cambia il livello di accesso di una risorsa;
- viene introdotta o rimossa un'entità dati;
- cambia la procedura di pubblicazione;
- un modulo viene estratto da `AdminDashboard` o `JobDetailPage`.

Ogni aggiornamento deve indicare la Pull Request nel registro del
[piano di consolidamento](./PIANO-CONSOLIDAMENTO-PIATTAFORMA.md).
