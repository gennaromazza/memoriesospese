# Percorso stampa: due livelli di test

Il test browser `../photobook-shipment.spec.ts` monta il vero `PhotobooksManager`
e intercetta le API per verificare rapidamente gli stati dell'interfaccia.

Il test integrato aggiuntivo monta lo stesso manager, ma inoltra le richieste
alle **vere route Express** di fotolibri e laboratori:

```sh
cd artifacts/api-server
pnpm exec vitest run --config vitest.config.ts src/photobook-shipment-integrated.test.ts
```

Richiede Chromium disponibile a `/repl/tools/bin/chromium`, oppure il browser
installato per Playwright. Non richiede credenziali, Firebase Emulator, Drive,
posta o avvio dei workflow dell'app.

## Isolamento

- Firestore e Storage sono mappe in memoria; Drive conserva copie dei byte.
- Autenticazione e trasporto email sono sostituiti solo nel processo di test.
- I moduli reali di inizializzazione Firebase e posta non sono importati.
- Le connessioni del server sono limitate al loopback. Il browser abortisce
  tutte le richieste esterne, inclusi i font del CSS condiviso.
- Express e Vite condividono un'origine locale su una porta effimera; nessuna
  richiesta passa dall'app in esecuzione o dal suo database.
- Browser, Vite e server vengono chiusi anche dopo un fallimento.

## Contratti verificati

La creazione avviene dall'interfaccia in modalità autonoma, senza Job o galleria.
L'upload usa il vero helper browser `uploadPhotobookPage` e la vera route raw
JPEG, non documenti pagina precostruiti. L'editor completo è una pagina distinta:
qui si verifica il contratto di caricamento, non il suo selettore di file.

Si provoca il fallimento della seconda di tre pagine; si verificano stato
parziale e invio email bloccato sia nell'interfaccia sia lato API. Dopo refresh,
il retry dall'interfaccia riusa la spedizione e copia solo la pagina mancante.
Le copie Drive sono confrontate byte per byte con gli originali caricati.

Un ulteriore refresh conferma la card e l'email ancora da inviare. Solo il click
esplicito invoca il trasporto email simulato, con destinatario e link reali della
spedizione simulata. Lo stato inviato resta visibile dopo un altro refresh,
senza un secondo invio. Anche il documento istruzioni viene generato dal codice
reale e controllato nelle copie Drive.
