---
name: Destinatari marketing dalle prenotazioni
description: Regola di inclusione per email valide presenti nello snapshot prenotazione quando manca o è incompleta la scheda cliente.
---

Per le campagne di prenotazione concluse, usa gli stati ammessi e normalizza gli indirizzi email prima di conteggiare o deduplicare. Se la scheda cliente non esiste o non contiene email/nome utilizzabili, conserva i dati validi nello snapshot della prenotazione; segnala il contatto non collegato senza escluderlo. Le prenotazioni annullate non entrano nell’audience.

**Why:** Le prenotazioni mantengono uno snapshot dei dati del cliente e non devono sparire dall’invio solo perché la relazione con l’anagrafica è assente o incompleta.

**How to apply:** Mantieni allineati elenco, conteggio della campagna e validazione dell’invio; deduplica sempre sull’email normalizzata, anche quando i contatti provengono da più gruppi.

Il pubblico marketing deve essere scelto esplicitamente. “Tutti i clienti” è alternativo ai gruppi specifici, non va preselezionato né sommato implicitamente alle campagne.

**Why:** La selezione cumulativa con l’anagrafica generale può includere quasi tutti i clienti anche quando il titolare intende contattare solo campagne specifiche.

**How to apply:** Mostrare tutti i gruppi attivi e il conteggio nella conferma. Riprendere un invio fallito conserva il pubblico originale: non applicare o far credere di applicare i nuovi filtri a quella ripresa.
