---
name: Mockup renderer standalone tabs
description: Le schede interne dei renderer devono funzionare anche fuori dall’adattatore React del wizard.
---

Il documento HTML/JS del renderer deve inizializzare e gestire direttamente le proprie schede e sezioni. L’adattatore del wizard può poi sincronizzare lo stesso stato quando l’iframe viene incorporato, ma non deve essere l’unico codice che rende operative le tab.

**Why:** una verifica visiva diretta del renderer ha mostrato tutte le sezioni contemporaneamente, anche se il percorso integrato nel wizard funzionava.

**How to apply:** quando si aggiungono pannelli annidati, verificare sia l’URL standalone sia l’iframe del wizard; mantenere l’inizializzazione standalone idempotente rispetto agli handler aggiunti dall’adattatore.