---
name: Collaborator costs in Job margins
description: Accounting rule for assigned collaborator compensation, advances, and Job net margin.
---

# Costi collaboratori nel margine Job

**Regola:** il margine del Job sottrae gli importi effettivamente registrati come pagamenti ai collaboratori, inclusi gli acconti, senza dipendere dallo stato di accettazione. Il compenso complessivo concordato e il residuo sono informativi: le quote non ancora pagate non si sommano ai costi.

Un pagamento già rappresentato da un costo lavoro manuale non va contato due volte. Preferire il collegamento tramite `cashMovementId`; per voci storiche senza link, usare importo e data esatti per una riconciliazione uno-a-uno.

**Why:** l’utente vuole che i costi riflettano le uscite effettive, anche se sono acconti; includere anche la parte concordata ma non pagata sovrastimerebbe i costi.

**How to apply:** aggiungere ai costi una riga per ogni pagamento registrato nel dettaglio collaboratore, anche se l’incarico è in attesa o rifiutato; mostrare il compenso residuo separatamente senza sommarlo al margine e deduplicare le voci manuali dello stesso pagamento.

**Regola aggiuntiva:** modificare il compenso concordato non modifica i pagamenti storici né i movimenti di cassa. La modifica deve leggere il totale pagato e aggiornare assegnazione/compenso nella stessa transazione usata per proteggere le registrazioni dei pagamenti; il nuovo compenso non può essere inferiore al totale già pagato.

**Why:** la soglia di pagamento dipende dal compenso corrente; un aggiornamento concorrente non atomico può altrimenti consentire un acconto in più o creare un compenso inferiore alle uscite già registrate.

**How to apply:** confrontare importi in centesimi dentro la transazione dell’assegnazione; aggiornare solo compenso, residuo e stato pagato. Non riscrivere `pagamenti` e non creare/eliminare movimenti cassa.
