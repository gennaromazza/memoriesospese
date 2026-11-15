---
name: Nomi dei payload OpenAPI con Orval
description: Evitare collisioni tra tipi generati e schemi Zod nei request body generici.
---

Per request body a oggetto generico, usare uno schema nominato per l'entità e
richiamarlo con `$ref`, evitando nomi basati sull'operazione con suffisso `Body`.

**Why:** i generatori client e Zod possono produrre due esportazioni omonime
per un body inline con proprietà aggiuntive; la generazione riesce, ma il
controllo dei barrel pubblici fallisce con TS2308.

**How to apply:** dopo ogni modifica al contratto eseguire l'intera generazione
e il controllo dei tipi delle librerie, non fermarsi al messaggio di successo
di un singolo generatore. Rinominare lo schema sorgente, non i file generati.
