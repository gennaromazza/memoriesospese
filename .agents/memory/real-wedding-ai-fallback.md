---
name: Real Wedding AI fallback
description: La generazione dell’articolo deve restare disponibile anche quando il provider IA o la verifica fornitori falliscono.
---

La generazione Real Wedding usa una sola chiamata IA per azione. Se la risposta è assente, invalida, troncata o respinta dai controlli editoriali, il server deve restituire una bozza deterministica modificabile costruita solo da dati autorizzati, fatti del Job, capitoli e nomi fornitori.

**Why:** retry automatici e ricerca online dei fornitori possono consumare richieste senza lasciare una bozza; il risultato minimo utile deve essere garantito anche durante un disservizio esterno.

**How to apply:** la verifica fornitori durante la generazione deve usare solo la cache; ogni nuova chiamata IA deve essere esplicita e un eventuale fallback deve filtrare email, telefoni, indirizzi e altri dati privati.