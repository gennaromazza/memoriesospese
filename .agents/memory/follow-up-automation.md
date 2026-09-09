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