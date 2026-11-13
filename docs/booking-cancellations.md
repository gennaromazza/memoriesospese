# Annullamenti e rimborsi delle prenotazioni

## Condizioni e compatibilità

Il form pubblico mostra il testo condiviso e trasmette la sua versione. Il server
ne salva una copia nella richiesta o nel checkout; l'incasso conserva quella copia.
La campagna attuale non riscrive le condizioni originali. Le vecchie prenotazioni
senza copia restano gestibili dallo studio, senza nuove condizioni retroattive.

Il cliente confermato può annullare prima dell'inizio dello shooting. A inizio
shooting, durante un cambio in corso o con un pagamento da riconciliare deve
contattare lo studio. La richiesta richiede il proprio token e l'orario atteso,
ricontrollati nella transazione. Nessun importo proviene dal browser.

## Calendario e comunicazioni

L'annullamento tiene protetto l'orario fino alla cancellazione verificata
dell'evento sul calendario corretto; 404 e 410 significano evento già assente.
Il checkout eventualmente ancora aperto viene annullato. Le catture successive
restano nel percorso esistente di incasso tardivo, senza riconfermare lo slot.
Un guasto non presenta l'annullamento come riuscito e conserva la riserva.
Dopo cinque tentativi il caso richiede verifica amministrativa; il pulsante
dedicato può riprendere la stessa cancellazione, non un evento diverso.

L'email di esito segue il completamento e riporta contatti salvati dello studio,
avviso automatico e nessuna falsa promessa di rimborso. Un invio ambiguo non viene
ritentato automaticamente. La pagina personale mostra lo stato aggiornato.

## Acconti e scelta amministrativa

Il cliente non avvia movimenti di denaro. Se lo studio annulla un appuntamento
pagato deve scegliere tra nuova data da concordare e rimborso integrale. Gli
acconti non PayPal rimangono esplicitamente da gestire direttamente con il cliente.
Il pannello distingue questa situazione da un rimborso PayPal effettivamente
confermato. Prenotazioni con acconti non vanno eliminate, neppure in cascata.

Il rimborso PayPal richiede conferma esplicita e usa la ricevuta originale,
associazione al conto PayPal, identità dell'ordine e importo in centesimi.
I pagamenti immediati tardivi senza prenotazione si gestiscono dallo stesso
pannello degli incassi da verificare, senza creare appuntamenti per rimborsarli.
La conferma include un controllo sull'importo mostrato: se cambia durante
l'operazione, il server blocca il rimborso e chiede una nuova conferma. Il valore
atteso dal browser non determina mai l'importo effettivamente restituito.

Una sola istanza può inviare il POST. Prima della chiamata viene salvato il fatto
che il provider potrebbe averla ricevuta. La chiave stabile è corta e specifica
dell'incasso. Dopo qualunque esito incerto, il recupero usa esclusivamente GET,
anche oltre la finestra di conservazione delle chiavi del provider: nessun secondo
POST alla cieca. Il pannello permette verifiche aggiuntive. Un errore precedente
a qualsiasi chiamata finanziaria può essere riprovato solo dopo nuova conferma
esplicita dell'admin.

Il rimborso viene contabilizzato soltanto con stato COMPLETED, identità,
importo, valuta e collegamento all'incasso verificati. L'uscita in cassa ha un ID
deterministico e non può duplicarsi; l'incasso e le sue commissioni restano nello
storico. PENDING e risposte non verificabili non sono presentati come rimborsati.

## Verifiche sicure

I test usano Firestore simulato, Google simulato e PayPal simulato. Non effettuare
incassi, rimborsi o email reali per collaudare. Le prove browser sono opt-in con
BOOKING_PORTAL_BROWSER_E2E=1 e isolano tutte le richieste esterne.

Prima della pubblicazione resta necessaria la verifica end-to-end già prevista:
in particolare la prima sincronizzazione Calendar delle prenotazioni pagate,
segnalate con calendarSyncPending, e la sua eventuale concorrenza con
l'annullamento. La verifica della sola cancellazione di un evento esistente non
sostituisce questo controllo.

Riferimenti provider:
- https://developer.paypal.com/api/payments/v2/captures-refund
- https://developer.paypal.com/api/rest/reference/idempotency/
