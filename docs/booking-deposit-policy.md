# Regole confermate per prenotazioni e acconti

Stato: approvato dal titolare nella conversazione del progetto.
Questo documento definisce il comportamento da implementare; non attiva pagamenti
e non descrive funzionalità già rilasciate.

## Configurazione e compatibilità

- Approvazione amministratore e richiesta di acconto sono due opzioni indipendenti
  per campagna.
- Se l'acconto è attivo, l'amministratore imposta un importo fisso nella campagna.
- Le campagne esistenti senza le nuove impostazioni mantengono approvazione
  attiva e acconto disattivato. Nessuna modifica alle prenotazioni già presenti.
- Scegliere i prodotti in studio non esonera dal pagamento dell'acconto.
  L'importo non dipende dalla scelta anticipata dei prodotti.

## Quattro percorsi

| Approvazione | Acconto | Percorso |
| --- | --- | --- |
| Sì | No | Richiesta, approvazione amministratore, conferma finale. |
| No | No | Conferma immediata senza PayPal. |
| No | Sì | Checkout PayPal immediato; conferma finale solo dopo incasso verificato. |
| Sì | Sì | Richiesta, approvazione amministratore, email per pagare entro un'ora; conferma finale solo dopo incasso verificato. |

## Scadenze e disponibilità

Tutte le scadenze sono determinate e verificate dal server, non dall'orologio del
browser. Un termine è scaduto quando l'ora server è uguale o successiva al termine.

### Checkout immediato

- Lo slot resta riservato per 10 minuti dall'avvio del checkout.
- Chiudere la pagina non cancella immediatamente la riserva: senza pagamento,
  scade comunque al termine dei 10 minuti.
- Ricaricare la pagina non rinnova il termine.
- Alla scadenza senza incasso valido lo slot torna disponibile.

### Attesa dell'approvazione

- La richiesta riserva lo slot per un massimo di 24 ore dalla creazione.
- La scadenza effettiva è il primo tra creazione più 24 ore e inizio shooting.
- Alla scadenza senza approvazione la richiesta scade e lo slot viene liberato.
- Una richiesta già scaduta non può essere riattivata tacitamente approvandola.

### Pagamento dopo approvazione

- L'approvazione avvia una finestra di un'ora per pagare e l'invio dell'email con
  il link di pagamento. L'email mostra il termine effettivo.
- Non esiste rinnovo automatico della finestra.
- Alla scadenza senza incasso valido lo slot torna disponibile.
- Quando manca un'ora o meno all'inizio dello shooting, non si avvia il pagamento
  differito: la prenotazione richiede gestione diretta dello studio.

## Riprogrammazione

- Il cliente confermato può effettuare un solo cambio autonomo tramite il link
  personale, fino a 24 ore prima dell'orario corrente dello shooting.
  Esattamente 24 ore prima il cambio è ancora consentito.
- La nuova data deve appartenere alla stessa campagna ed essere disponibile.
- Il cambio riuscito trasferisce l'acconto alla stessa prenotazione, senza
  richiedere un nuovo pagamento.
- Un tentativo fallito non consuma l'unico cambio disponibile e non perde lo slot
  originale. Due richieste simultanee non devono produrre due cambi.
- Dopo il primo cambio, oppure a meno di 24 ore dallo shooting, il cliente deve
  contattare lo studio. Non è previsto il passaggio autonomo a un'altra campagna.

## Annullamenti e rimborsi

- Prima dell'inizio dello shooting il cliente può annullare tramite il link
  personale; l'annullamento libera lo slot.
- Annullamento e rimborso sono operazioni distinte. Un acconto già incassato resta
  tracciato, ma non comporta un rimborso automatico né una trattenuta automatica.
  La decisione sul rimborso spetta all'amministratore.
- Dopo l'inizio dello shooting non è disponibile l'annullamento autonomo:
  occorre contattare lo studio.
- Se lo studio annulla uno shooting pagato, il pannello richiede di scegliere
  tra riprogrammazione concordata e rimborso integrale.
- Nessun movimento di denaro parte senza conferma esplicita dell'amministratore.

## Incassi tardivi

- Un incasso confermato da PayPal dopo la scadenza non conferma automaticamente
  la prenotazione e non riassegna lo slot, neppure quando risulta ancora libero.
- L'incasso rimane registrato e viene segnalato all'amministratore come caso da
  risolvere, distinto da una prenotazione confermata.
- L'amministratore sceglie una nuova data concordata oppure il rimborso integrale.
- Ripetizioni della stessa notifica PayPal non generano ulteriori incassi,
  conferme, email di conferma o rimborsi.

## Comunicazioni

- La conferma finale contiene sempre il link personale sicuro di gestione e il
  collegamento al calendario; non serve un account con password.
- Prima della conferma finale, nel percorso con approvazione e acconto, l'email
  contiene il link per pagare. Non presenta la prenotazione come già confermata.

## Verifiche richieste ai task di implementazione

- Verificare separatamente i quattro percorsi e i default delle campagne legacy.
- Verificare scelta prodotti in studio con e senza acconto.
- Testare prima, esattamente al limite e dopo ogni scadenza usando un orologio
  controllato: 10 minuti, 24 ore, un'ora e soglia di cambio data.
- Testare chiusura/ricaricamento pagina, slot concorrenti, doppio cambio,
  notifiche PayPal ripetute e incasso tardivo anche con slot ancora libero.
- Verificare che annullare liberi lo slot ma non avvii un rimborso, e che un
  rimborso richieda conferma amministratore e non possa essere duplicato.
- Verificare che nessun percorso modifichi retroattivamente prenotazioni esistenti.
