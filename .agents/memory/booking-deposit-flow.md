---
name: Acconto per prenotazioni shooting
description: Impostazioni per campagna su approvazione admin e acconto, con conferma cliente.
---

Le campagne devono poter configurare separatamente se richiedono approvazione admin e se richiedono un acconto. Se serve l'acconto, l'amministratore sceglie direttamente nella campagna l'importo fisso da richiedere. Se servono sia approvazione sia acconto, il cliente invia la richiesta, l'admin approva e riceve una richiesta PayPal con un'ora di scadenza; il pagamento riuscito finalizza la prenotazione, mentre la scadenza libera lo slot. Se l'approvazione è disattivata ma l'acconto è attivo, il pagamento PayPal parte subito dopo la scelta dello slot: non si invia una richiesta differita di un'ora; si tiene lo slot solo mentre il checkout è in corso e il pagamento riuscito conferma la prenotazione. Se l'acconto è disattivato, non si avvia PayPal e vale il percorso di approvazione selezionato per quella campagna.

La mail di conferma finale contiene sempre il link personale sicuro per gestire la prenotazione e il collegamento al calendario; il cliente non deve creare un account con password.

**Why:** alcune campagne richiedono approvazione e/o acconto e altre no; le regole devono essere selezionabili per campagna senza cambiare il comportamento globale.

**How to apply:** mantenere indipendenti le due impostazioni nel pannello admin e applicarle lato server; salvare per campagna l'importo fisso deciso dall'admin. La finestra di un'ora vale solo per l'acconto richiesto dopo approvazione; il checkout immediato ha un hold breve limitato alla sessione di pagamento. Gestire esplicitamente scadenze, slot liberati e catture PayPal tardive. Inviare il link di gestione solo nell'email di conferma finale.
