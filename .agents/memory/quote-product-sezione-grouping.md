---
name: Quote product display grouping (sezione)
description: Come vanno raggruppati/ordinati i prodotti di un preventivo in QUALSIASI vista cliente (Preventivo Rapido, portale, ecc.).
---

# Raggruppamento prodotti preventivo = campo `sezione` (non `categoria`)

`QuoteProduct` ha DUE tassonomie distinte:
- `sezione` → raggruppamento visivo deciso dall'admin (es. "Foto"/"Video"/"Extra"). È questo che governa ordine e intestazioni di gruppo.
- `categoria` → tag separato del prodotto (es. jobType tipo "prima comunione"/"battesimo"). NON è per il raggruppamento; di norma NON va mostrato al cliente.

**Regola:** ogni vista che mostra i prodotti di un preventivo/template al cliente deve replicare l'algoritmo `groupItems` di `ProductOrderEditor` (l'editor drag-and-drop admin):
raggruppa per `sezione?.trim() || null`, ordine di **prima apparizione** delle sezioni, ordine relativo interno preservato, intestazione mostrata solo quando `sezione` cambia ed è non-null. Così ciò che vede l'admin coincide con ciò che vede il cliente.

**Why:** l'admin ordina/divide i prodotti via drag-and-drop (ProductOrderEditor) e il risultato è persistito già raggruppato nell'array `defaultProducts` (con `sezione`); il server pubblico lo restituisce intatto. Se una vista cliente mappa l'array senza intestazioni di sezione, ordine e divisione "spariscono" per l'utente anche se i dati sono corretti.

**How to apply:** quando aggiungi/rifai una vista prodotti preventivo (client), NON reintrodurre il badge `categoria` e NON mappare piatto: applica il grouping per `sezione`. `ProductOrderEditor` è la fonte di verità dell'algoritmo.
