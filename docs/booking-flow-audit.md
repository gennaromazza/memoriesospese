# Collaudo prenotazioni — 14 novembre 2026

## Esito

I percorsi nuovi di approvazione/acconto e gestione cliente sono coperti dalle
prove descritte sotto. È stata corretta la prima sincronizzazione Calendar
successiva all'incasso. **Questo rapporto non autorizza la pubblicazione**:
rimane aperta la protezione completa dell'eliminazione legacy di dati collegati.

## Matrice verificata

| Approvazione | Acconto | Percorso |
| --- | --- | --- |
| Sì | No | Richiesta in attesa, approvazione admin, evento e conferma con link personale |
| No | No | Conferma automatica, evento e link personale |
| Sì | Sì | Richiesta, approvazione, importo congelato e scadenza di un'ora, conferma solo dopo incasso |
| No | Sì | Hold immediato, checkout PayPal, conferma solo dopo incasso |

Le suite verificano prenotazioni simultanee, conflitti tra campagne, scadenze,
pagamenti annullati, duplicati, tardivi e dall'esito incerto; mantengono separati
incasso, rimborso, stato dello slot e comunicazioni. Comprendono le regressioni
degli altri utilizzi PayPal già presenti.

## Correzioni effettuate

- Il worker delle conferme pagate ora sincronizza Calendar prima di comporre
  l'email finale. Prima non c'era un consumatore della prima sincronizzazione
  richiesta dopo l'incasso.
- L'identità dell'evento è stabile. Un inserimento riuscito seguito da timeout
  viene riconciliato senza creare una seconda identità.
- La riconciliazione verifica data, durata, identità e stato dell'evento.
  Non dichiara completata una risposta incerta e non modifica gli importi.
- Durante questa sincronizzazione, annullamento e cambio data sono sospesi:
  non si può liberare uno slot mentre Google potrebbe ancora creare l'evento.
- Le regole Firestore nel repository negano la DELETE diretta delle prenotazioni
  e gli aggiornamenti client durante la sincronizzazione. **Verificate solo
  nell'emulatore: non applicate al database reale durante questo collaudo.**
- Ripristinato l'identificatore del contenitore prodotti usato dalla prova
  responsive della campagna.

## Risultati riproducibili

- API: **509 test, 28 file**, superati; inclusi quattro percorsi, pagamenti,
  gestione privata, annullamenti/rimborsi, Calendar e isolamento della rete.
- Frontend: **116 test, 12 file**, superati.
- Regole Firestore: **11 test**, superati su emulatore con progetto demo.
- Browser cliente: **8 test**, superati nell'app effettiva, con API/router reali
  collegati a dati e provider simulati.
- Browser configurazione prodotti campagna: **2 test**, superati; selezione,
  salvataggio, nomi lunghi e scorrimento su telefono e desktop.
- Controlli TypeScript di API e frontend: superati.
- Build API e frontend: superate. Restano gli avvisi preesistenti di dimensione
  bundle e importazione pdf-parse, non introdotti da questo intervento.
- Servizi riavviati e avvio verificato. Nessuna pubblicazione eseguita.

La pagina admin autenticata completa non è stata verificata con un accesso reale:
sono stati usati test di componente, prove dei permessi API e harness browser
isolati. La suite dei collegamenti campagne basata su server applicativo ed
emulatori Auth/Firestore non è stata eseguita in questa sessione.

La prima esecuzione del portale browser ha incontrato una dipendenza Vite
scaduta (504); dopo il riavvio il modulo ha risposto 200 e tutti gli otto casi
sono passati.

## Incidente di isolamento corretto

Una prova preesistente simulava Gmail ma non Calendar. Collegando la nuova
sincronizzazione, quella prova ha creato un evento sintetico nel 2030.
L'evento è stato identificato rigorosamente per ID deterministico, intestazione,
descrizione e orari fittizi, rimosso e la rimozione verificata. Non è stata
modificata una prenotazione cliente o un documento Firestore reale.

La prova ora simula anche Calendar. La configurazione dei test API blocca inoltre
fetch, HTTP, HTTPS e HTTP/2 verso host esterni prima della richiesta, lasciando
disponibili solo server locali per fixture. Il blocco sopravvive al ripristino
dei mock. Le 509 prove citate sopra sono l'esecuzione finale con tale protezione.

## Blocchi prima della pubblicazione

### Eliminazione legacy e vecchi client

La normale eliminazione frontend non invia più email prima dell'esito del
server, e le prenotazioni con acconto sono indirizzate al pannello dedicato.
Questo **non risolve** la vecchia eliminazione in cascata: dopo un controllo
locale può ancora tentare di cancellare dati collegati e notificare il cliente
prima dell'ultimo controllo server. La DELETE server non è ancora atomica con
ogni percorso concorrente di pagamento.

Servono autorizzazione/blocco autorevoli prima di qualsiasi effetto, protezione
dei dati collegati anche contro client già aperti, e rifiuto delle notifiche
legacy prive di un annullamento completato. Il solo controllo frontend o il
solo divieto di DELETE del documento prenotazione non sono sufficienti.

File di riferimento:
- `artifacts/image-studio-web/src/lib/bookings.ts`
- `artifacts/image-studio-web/src/lib/booking-deletion.ts`
- `artifacts/api-server/src/booking-routes.ts`
- `artifacts/api-server/src/email-routes.ts`
- `firestore.rules`

### Ripresa operativa delle conferme

La prima sincronizzazione viene riprovata dal worker prima dell'invio. Dopo
l'esaurimento dei tentativi, il caso resta da verificare e non libera lo slot.
È utile un comando admin dedicato per riprendere soltanto sincronizzazione e
conferma, senza catturare un pagamento o ripetere un'email dall'esito ignoto.
Non confondere questa ripresa tecnica con rimborso o riprogrammazione.
