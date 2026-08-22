# Piano di consolidamento di Memorie Sospese

> Documento operativo di riferimento per rendere la piattaforma più sicura,
> stabile, verificabile e semplice da evolvere senza riscriverla.

## Stato del documento

| Campo | Valore |
| --- | --- |
| Versione | 1.0 |
| Data iniziale | 22 agosto 2026 |
| Stato | Attivo |
| Repository | `gennaromazza/memoriesospese` |
| Documento collegato | [Mappa tecnica della piattaforma](./MAPPA-TECNICA-PIATTAFORMA.md) |

## Obiettivo

Consolidare progressivamente il software già esistente, proteggendo i flussi
quotidiani dello studio e riducendo il rischio di regressioni. Non è prevista
una riscrittura totale: ogni modulo viene verificato, protetto da test e
migliorato per passi piccoli e reversibili.

## Principi di lavoro

1. Nessuna modifica diretta su `main`.
2. Ogni intervento passa attraverso una Pull Request.
3. Ogni bug corretto deve ricevere, quando possibile, un test di regressione.
4. Prima di migrazioni o operazioni distruttive viene creato un backup.
5. Le regole Firebase vengono provate negli emulatori prima del deploy.
6. Non si elimina codice storico senza averne verificato gli utilizzi.
7. Refactoring e cambiamento funzionale vengono separati quando possibile.
8. GitHub è la fonte ufficiale; Replit riceve solo modifiche già pubblicate.
9. Segreti e credenziali restano nei Secrets e non entrano nella repository.
10. Ogni fase deve avere criteri verificabili di completamento e rollback.

## Situazione iniziale

La piattaforma comprende sito pubblico, pannello amministrativo, gallerie,
clienti e lavori, pagamenti, fatturazione, prenotazioni, Google Calendar,
email, preventivi, contratti, collaboratori, laboratori, fotolibri, backup,
audit e diverse integrazioni esterne.

Indicatori rilevati al momento della prima analisi:

- circa 424 file nei nuclei principali `client`, `server` e `shared`;
- oltre 40 percorsi frontend;
- più di 20 gruppi API backend;
- circa 27 file di test, con copertura end-to-end ancora limitata;
- assenza iniziale di una pipeline GitHub Actions;
- componenti molto estesi, in particolare `AdminDashboard.tsx` e
  `JobDetailPage.tsx`;
- regole Firestore storiche che richiedono un audit specifico.

## Classificazione delle priorità

| Livello | Significato | Esempi |
| --- | --- | --- |
| P0 | Rischio immediato per sicurezza o dati | accessi non autorizzati, perdita dati, segreti esposti |
| P1 | Blocco di un flusso aziendale essenziale | login admin, lavori, pagamenti, fatture, calendario |
| P2 | Malfunzionamento importante ma aggirabile | mobile, email secondarie, ordinamenti, filtri |
| P3 | Miglioria tecnica o di esperienza | prestazioni, pulizia, accessibilità, refactoring |

## Roadmap

### Fase 0 — Inventario e rete di sicurezza

**Obiettivo:** fotografare lo stato reale prima di modificare aree sensibili.

Attività:

- [ ] verificare un backup completo di Firestore;
- [ ] verificare il backup dei file importanti in Storage;
- [ ] censire collezioni, sottocollezioni e campi realmente presenti;
- [ ] censire Secrets e variabili d'ambiente senza registrarne i valori;
- [ ] classificare API e pagine come pubbliche, cliente, collaboratore o admin;
- [ ] identificare servizi esterni e responsabile di ogni credenziale;
- [ ] documentare la procedura GitHub → Replit → pubblicazione;
- [ ] definire i flussi aziendali che non possono interrompersi.

Criteri di completamento:

- esiste un inventario verificato;
- almeno un backup è stato ripristinato in ambiente di prova;
- ogni area critica ha un responsabile e una procedura di emergenza;
- non sono state effettuate modifiche distruttive sui dati di produzione.

### Fase 1 — Sicurezza

**Obiettivo:** impedire letture e modifiche non autorizzate.

Attività:

- [ ] classificare ogni regola Firestore e Storage;
- [ ] sostituire il controllo provvisorio `hasValidToken()`;
- [ ] proteggere risposte e bozze dei questionari;
- [ ] verificare `validationSessions`, `rateLimits` e `distributedLocks`;
- [ ] controllare tutte le API che modificano dati;
- [ ] applicare `authenticateFirebase` e `requireAdmin` dove necessari;
- [ ] rendere Firebase Auth l'autorità effettiva per l'admin;
- [ ] verificare token di preventivi, collaboratori, fotolibri e moduli;
- [ ] aggiungere limiti contro spam e abuso;
- [ ] creare test automatici delle regole con Firebase Emulator.

Criteri di completamento:

- nessuna operazione amministrativa è eseguibile senza token valido;
- nessun dato cliente è accessibile conoscendo soltanto un identificativo;
- i flussi pubblici autorizzati continuano a funzionare;
- i test delle regole coprono accesso consentito e accesso negato.

### Fase 2 — Integrazione continua

**Obiettivo:** bloccare automaticamente modifiche non verificabili.

Pipeline richiesta per ogni Pull Request:

- [ ] installazione riproducibile con `npm ci`;
- [ ] controllo TypeScript frontend e backend;
- [ ] build frontend e backend;
- [ ] test Vitest;
- [ ] test delle regole Firebase;
- [ ] test XML FatturaPA;
- [ ] test Playwright dei flussi essenziali;
- [ ] controllo dipendenze e segreti.

Criteri di completamento:

- `main` è protetto;
- non si può eseguire il merge con controlli obbligatori falliti;
- i risultati dei test restano consultabili nella Pull Request.

### Fase 3 — Contratti e qualità dei dati

**Obiettivo:** rendere prevedibili i documenti salvati in Firestore.

Attività:

- [ ] definire uno schema Zod per ogni entità critica;
- [ ] introdurre una funzione centrale che rimuova `undefined`;
- [ ] condividere i tipi tra frontend e backend;
- [ ] normalizzare telefoni, email, indirizzi, date e importi;
- [ ] versionare i documenti che richiedono migrazioni;
- [ ] creare migrazioni con anteprima, report e rollback;
- [ ] individuare e consolidare campi legacy duplicati.

Ordine delle entità:

1. clienti;
2. lavori;
3. pagamenti;
4. fatture;
5. prenotazioni e consulenze;
6. gallerie;
7. collaboratori;
8. impostazioni studio.

### Fase 4 — Flussi aziendali critici

#### 4A — Clienti e lavori

- [ ] creazione, modifica ed eliminazione controllata;
- [ ] associazione di più clienti a un lavoro;
- [ ] dati fiscali e indirizzi strutturati;
- [ ] stati del lavoro e cronologia;
- [ ] note, allegati, ricerca e filtri.

#### 4B — Pagamenti e fatturazione

- [ ] piano pagamenti, acconti e saldi;
- [ ] riconciliazione degli importi;
- [ ] numerazione delle fatture;
- [ ] XML FatturaPA e compatibilità Aruba;
- [ ] regime fiscale, natura IVA e bollo;
- [ ] eliminazione controllata e audit.

#### 4C — Agenda, booking e Calendar

- [ ] disponibilità e conflitti;
- [ ] approvazione, rifiuto e cancellazione;
- [ ] sincronizzazione idempotente con Google Calendar;
- [ ] prevenzione degli eventi duplicati;
- [ ] retry e stato delle credenziali;
- [ ] promemoria e notifiche.

#### 4D — Gallerie

- [ ] accesso, password e PIN;
- [ ] upload, miniature e download;
- [ ] selezioni, commenti e note vocali;
- [ ] questionari;
- [ ] eliminazione, recupero e foto orfane.

#### 4E — Preventivi e contratti

- [ ] bozze e versioni;
- [ ] firme e PDF;
- [ ] collegamento al lavoro;
- [ ] notifiche;
- [ ] sicurezza dei token pubblici.

### Fase 5 — Modularizzazione progressiva

**Obiettivo:** ridurre la probabilità di effetti collaterali.

Estrazioni previste da `AdminDashboard`:

- [ ] `AdminLayout`;
- [ ] `AgendaSection`;
- [ ] `JobsSection`;
- [ ] `GalleriesSection`;
- [ ] `CommunicationSection`;
- [ ] `FinanceSection`;
- [ ] `SettingsSection`;
- [ ] `AssistantSection`.

Estrazioni previste da `JobDetailPage`:

- [ ] `JobHeader`;
- [ ] `ClientSection`;
- [ ] `ContractSection`;
- [ ] `PaymentSection`;
- [ ] `InvoiceSection`;
- [ ] `GallerySection`;
- [ ] `CollaboratorsSection`;
- [ ] `NotesSection`;
- [ ] `ActivityHistory`.

Regola: una sola estrazione per Pull Request, senza cambiare contestualmente il
comportamento funzionale.

### Fase 6 — Errori e osservabilità

- [ ] formato comune degli errori API;
- [ ] identificativo per ogni richiesta;
- [ ] log strutturati senza dati sensibili;
- [ ] messaggi comprensibili per gli utenti;
- [ ] monitoraggio degli errori frontend e backend;
- [ ] stato di salute per Firebase, Calendar, email e Storage;
- [ ] alert per errori ripetuti;
- [ ] registro delle operazioni amministrative sensibili.

### Fase 7 — Mobile, PWA e accessibilità

- [ ] matrice di test iPhone e Android;
- [ ] verifica completa del pannello admin mobile;
- [ ] verifica PWA pubblica e PWA admin;
- [ ] modali e tabelle responsive;
- [ ] aree di tocco adeguate;
- [ ] gestione tastiera mobile;
- [ ] contrasto, focus e navigazione da tastiera;
- [ ] testi alternativi e stati di caricamento;
- [ ] comportamento con connessione lenta o intermittente.

### Fase 8 — Prestazioni

- [ ] misurare homepage, dashboard e gallerie;
- [ ] ridurre il bundle amministrativo;
- [ ] caricare le sezioni admin solo quando richieste;
- [ ] ottimizzare immagini e miniature;
- [ ] introdurre paginazione per query grandi;
- [ ] eliminare query duplicate e listener non necessari;
- [ ] definire budget prestazionali verificati in CI.

### Fase 9 — Backup e ripristino

- [ ] backup automatico programmato;
- [ ] backup obbligatorio prima delle migrazioni;
- [ ] copia esterna su Google Drive;
- [ ] prova periodica di ripristino;
- [ ] soft delete per entità critiche;
- [ ] registro e rollback delle operazioni distruttive;
- [ ] procedura documentata per indisponibilità di Replit o Firebase.

### Fase 10 — Documentazione

- [ ] avvio locale;
- [ ] aggiornamento e riavvio su Replit;
- [ ] pubblicazione;
- [ ] configurazione Secrets;
- [ ] Firebase e regole;
- [ ] Google Calendar;
- [ ] fatturazione;
- [ ] backup e ripristino;
- [ ] procedura per nuove funzionalità;
- [ ] procedura di emergenza.

## Sequenza dei cicli operativi

| Ciclo | Contenuto | Uscita attesa |
| --- | --- | --- |
| 1 | Inventario, backup, sicurezza iniziale, CI | base protetta e misurabile |
| 2 | Schemi dati, clienti, lavori, pagamenti, fatture | nucleo amministrativo stabile |
| 3 | Booking, Calendar, email, preventivi, contratti | integrazioni affidabili |
| 4 | Gallerie, questionari, Storage, backup | esperienza cliente protetta |
| 5 | Modularizzazione, prestazioni, mobile, accessibilità | manutenzione più semplice |

## Registro di avanzamento

Aggiornare questa tabella dopo ogni intervento rilevante.

| Data | Fase | Intervento | PR | Esito | Note |
| --- | --- | --- | --- | --- | --- |
| 2026-08-22 | Preparazione | Creazione piano e mappa tecnica | #26 | Completato | Prima versione del riferimento |

## Definition of Done generale

Un'attività è completata solo quando:

- il comportamento richiesto è implementato;
- TypeScript e build passano;
- i test pertinenti passano;
- è stato aggiunto un test di regressione se si corregge un bug;
- non sono state incluse modifiche estranee;
- la Pull Request descrive rischio, verifica e rollback;
- la documentazione viene aggiornata quando cambia un flusso operativo;
- la modifica è stata verificata nell'ambiente appropriato prima del deploy.

## Primo pacchetto da eseguire

1. inventario delle collezioni Firestore;
2. tabella delle API e dei livelli di accesso;
3. audit delle regole Firebase rischiose;
4. verifica di backup e ripristino;
5. prima pipeline GitHub con build, TypeScript e test;
6. test iniziali per login admin e operazioni protette.

Questo pacchetto deve essere prevalentemente diagnostico: le regole di
produzione verranno modificate solo dopo aver riprodotto e testato i relativi
flussi negli emulatori.
