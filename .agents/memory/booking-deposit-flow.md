---
name: Acconto per prenotazioni shooting
description: Flusso concordato per approvazione admin, pagamento entro un'ora e conferma cliente.
---

Per le campagne di shooting, il cliente arriva dalla presentazione e usa il link pubblico per inviare una richiesta di slot. L'amministratore approva la richiesta; solo allora parte via email la richiesta di acconto PayPal con una scadenza di un'ora. Il pagamento riuscito finalizza la prenotazione; senza pagamento entro la scadenza, la richiesta decade e lo slot va liberato. La conferma finale via email contiene il link personale sicuro per gestire la prenotazione e il collegamento al calendario; non si richiede un account con password.

**Why:** non incassare prima che lo studio abbia approvato la richiesta, evitare rimborsi quando lo studio rifiuta e non lasciare slot bloccati dopo una richiesta di pagamento scaduta.

**How to apply:** tenere distinti pre-approvazione, attesa pagamento e conferma finale. La scadenza va verificata lato server; un mancato pagamento deve liberare lo slot e un pagamento tardivo va riconciliato in modo esplicito. Inviare il link di gestione solo nell'email di conferma finale.
