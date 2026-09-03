---
name: Fornitori informativi strutturati
description: Regola di compatibilità per i fornitori raccolti dai Moduli Informativi e usati nelle storie Real Wedding
---

Le risposte nuove dei fornitori devono essere una lista di record con `name`, `category` e `location`. Il client non deve chiedere né inviare URL: i link editoriali possono provenire solo dalla ricerca server-side verificata e citata.

**Why:** i moduli storici contengono testo libero o oggetti con `role`/`url`; eliminarli o interpretarli come link attendibili romperebbe la lettura dello storico e potrebbe pubblicare riferimenti forniti dal cliente senza verifica.

**How to apply:** quando si legge una risposta vendor, normalizzare testo e oggetti legacy senza migrazione distruttiva. Quando si salva una nuova risposta, accettare solo la lista con i tre campi consentiti, applicare limiti e ignorare/rifiutare campi arbitrari. Le ricerche devono usare anche categoria e luogo e preferire Instagram solo se la citazione conferma il profilo.