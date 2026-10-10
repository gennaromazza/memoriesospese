---
name: GitHub sync without rewriting main
description: Sincronizzare un ramo Replit molto divergente da GitHub senza sovrascrivere la cronologia remota
---
Quando la cronologia del branch Replit è molto divergente ma l'albero dei file differisce poco da GitHub, un normale pull/push può fallire o tentare di trasferire migliaia di commit di pubblicazione. Il connector GitHub espone l'API REST via `proxyFetch`; non presumere che il token sia leggibile da `settings` e non stamparlo né esportarlo.

**Why:** il protocollo Git e le cronologie Replit possono divergere anche quando il codice corrente è quasi identico; riscrivere `main` rischia di cancellare commit GitHub, mentre includere file temporanei o screenshot può caricare materiale non desiderato.

**How to apply:** prima di sincronizzare, identifica il branch realmente attivo, confronta il tree con il ref GitHub aggiornato e controlla i file aggiunti/eliminati. Se l'utente vuole solo un backup, crea un nuovo branch GitHub con un commit snapshot basato sul ref remoto, includendo codice e asset necessari ma escludendo cache e allegati non richiesti. Mantieni `main` intatto; per una riscrittura della cronologia chiedi consenso esplicito.
