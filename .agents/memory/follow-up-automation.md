---
name: Automatic quote follow-ups
description: Regole operative per follow-up automatici dei preventivi e limiti del rilevamento contatti.
---

Il follow-up dei preventivi deve restare fail-closed: prima di ogni invio verificare che il Job sia ancora `lead`, il preventivo non sia firmato o sostituito, non esista un booking attivo, l'evento non sia passato, l'email sia valida e il template sia attivo. Il lock transazionale va scritto prima dell'invio e rimosso solo se Gmail fallisce.

**Why:** un follow-up duplicato o inviato dopo firma/booking è un danno commerciale maggiore di un invio posticipato.

**How to apply:** mantenere configurazione e template in collection dedicate, usare il timestamp di invio del preventivo come origine dei giorni cumulativi e registrare eventi append-only per statistiche e audit.

Le risposte Gmail non sono automaticamente riconoscibili dal sistema attuale. Fino a una sincronizzazione Gmail con thread/message ID, il Centro Follow-up deve offrire azioni esplicite per segnare risposta o contatto e sospendere la sequenza; non simulare risposte automatiche.

**Why:** le email inviate non contengono da sole un evento applicativo affidabile di risposta e WhatsApp/telefono non sono rilevabili con gli strumenti attuali.

**How to apply:** quando verrà aggiunta la sincronizzazione, riusare `followUpEvents` e gli stati esistenti invece di creare un secondo registro commerciale.

Dopo l'accettazione da Gmail, ogni fallimento nella persistenza dello stato o dell'audit deve creare un evento `followup_persistence_failed` consultabile nel Centro Follow-up. Il lock non va mai riaperto in questo percorso.

**Why:** Gmail può aver già consegnato il messaggio; un nuovo tentativo causerebbe un doppio invio, mentre il solo log server non avvisa lo studio della riconciliazione necessaria.

**How to apply:** includere sempre preventivo, step, tipo di persistenza e operazione fallita nell'evento; separare le scritture post-invio così un audit mancante non nasconda un eventuale problema di stato.

Per i Preventivi Rapidi nuovi, l'origine del follow-up è `emailSentAt`/`sentAt` scritto solo dopo l'accettazione dell'invio Gmail. Per i record legacy privi di questi campi, usare soltanto il percorso riconoscibile `preventivo-rapido` con contratto e token pubblico, marcando la fonte come fallback dalla data di creazione.

**Why:** il vecchio flusso inviava il link subito dopo la creazione della quote ma non salvava il timestamp; usare indiscriminatamente `createdAt` includerebbe preventivi non realmente inviati.

**How to apply:** mantenere il fallback limitato e auditabile; non usarlo per quote normali o per documenti senza contratto/token, e non sovrascrivere i timestamp espliciti.

Le prove manuali di un follow-up devono essere mirate a un solo preventivo e bypassare la scadenza in entrambe le guardie, prima e dentro la transazione; la forzatura non deve poter anticipare lo step 2 o 3.

**Why:** una sola guardia aggirata non basta: la transazione anti-concorrenza può ancora restituire `skipped`, mentre un bypass troppo ampio può inviare più step o coinvolgere altri clienti.

**How to apply:** mantenere sempre il filtro `quoteId`, consentire la forzatura solo con `sentSteps` vuoto e lasciare invariata la data di scadenza degli step successivi.

I contenuti marketing standard dei follow-up possono evolvere, ma un aggiornamento automatico deve sostituire solo la firma esatta del template legacy standard; i template personalizzati dall'admin vanno preservati.

**Why:** migliorare il copy dei lead non deve cancellare personalizzazioni commerciali già scelte dallo studio.

**How to apply:** versionare i template standard e usare un confronto esatto di oggetto e corpo prima di applicare un upgrade compatibile.