# Cambio appuntamento dal link personale

Il cliente confermato può cambiare una sola volta nella stessa campagna, fino
a 24 ore prima dell’appuntamento corrente (limite esatto incluso). Si conservano
pacchetto, acconto, ricevuta e movimenti finanziari. Non parte un altro pagamento.

## Scelta e conferma

- Il portale propone il periodo della campagna e orari calcolati dal server in
  Europe/Rome. Campagne scadute/disattivate, giorni esclusi, pause, prenotazioni,
  checkout, cambi in corso, consulenze, lavori e impegni Google bloccano gli slot.
- Si esclude soltanto il proprio evento Google nel relativo calendario: un ID
  uguale su un altro calendario continua a bloccare.
- Il server ricontrolla durata e disponibilità; non accetta intervalli arbitrari
  inviati dal browser o cambi di campagna/pacchetto.
- Intenzione UUID e orario originale rendono sicuri retry e richieste concorrenti.

## Conferma fra database e Google

Google e Firestore non condividono una transazione. Prima si riserva atomicamente
la destinazione, mantenendo anche l’appuntamento originale. Tutti i percorsi di
prenotazione leggono anche queste riserve. Si ricontrollano le risorse prima del
primo tentativo di modifica Google.

Si aggiorna l’evento esistente, senza crearne un altro. Se la prenotazione pagata
non ha ancora un evento, si utilizza un ID deterministico per riconciliare anche
un inserimento dall’esito incerto. Dopo la conferma Google, un’unica transazione
aggiorna le date e consuma l’unico cambio. L’email è un effetto separato: un suo
errore non annulla lo spostamento o l’acconto.

Un rifiuto certo prima di qualsiasi modifica conserva l’originale e libera la
destinazione. Un timeout potenzialmente successivo alla modifica mantiene invece
entrambe le riserve: il portale mostra il cambio in verifica, non un falso
successo. Il worker prova a riconciliare fino a tre tentativi; se non può risolvere
un esito incerto, lo stato richiede verifica dello studio. Non si libera una
destinazione su cui Google potrebbe avere già spostato l’appuntamento.

L’email contiene nuova data, calendario, link personale e footer dello studio.
Invii dall’esito incerto non vengono ripetuti automaticamente. Una revoca del link
non viene annullata per poter spedire l’email.

## Verifiche ripetibili senza dati reali

Test del servizio, con database simulato e confini Google/Gmail sostituiti:

```sh
pnpm --filter @workspace/api-server exec vitest run --config vitest.config.ts src/booking/rescheduling.test.ts
```

Con il workflow web attivo, test Chromium della vera applicazione collegata
al router API e a fixture isolate:

```sh
BOOKING_PORTAL_BROWSER_E2E=1 pnpm --filter @workspace/api-server exec vitest run --config vitest.config.ts src/booking/management-portal.browser.test.ts
```

Le richieste browser esterne sono bloccate. Non vengono creati appuntamenti reali,
inviate email reali o eseguiti pagamenti. Annullamenti e rimborsi restano separati.
