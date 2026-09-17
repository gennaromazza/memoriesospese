---
name: Mockup offer publish callback
description: Contratto tra editor admin e PhotobookMockup quando si pubblicano i modelli disponibili.
---
Il callback di pubblicazione deve propagare separatamente `mode` e `selections` fino alla richiesta `/offer`; non trattare il primo argomento come se fosse l’array dei modelli.

**Why:** l’editor invoca `publish(mode, selections)` e il server valida `selections` come array; perdere gli argomenti nel componente padre produce un rifiuto senza associare il modello.

**How to apply:** quando si modifica l’editor dell’offerta o il componente padre, verificare il payload con almeno una pubblicazione in modalità `choice` e una rilettura dell’offerta.