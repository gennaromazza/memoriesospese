---
name: Ciclo vita asset Blog
description: Regole di sicurezza per contenuti, immagini e date di pubblicazione del Blog.
---

Per i post del Blog, ogni file gestito dall'app deve avere il proprio path Storage persistito nel documento. Le sostituzioni e le eliminazioni devono aggiornare o cancellare prima il documento Firestore e pulire i vecchi file soltanto dopo che il write è riuscito. Gli upload asincroni dell'editor devono essere legati alla sessione del post e scartati/puliti se terminano dopo una chiusura o un cambio articolo. `publishedAt` rappresenta sempre la prima pubblicazione e non va cancellato tornando in bozza.

**Why:** Storage e Firestore non condividono una transazione. Cancellare prima il file può lasciare un documento che punta a contenuto inesistente; non invalidare gli upload può inserire asset nel post sbagliato o lasciare orfani.

**How to apply:** vale per qualsiasi editor, importatore o automazione che crea o modifica articoli. Conservare separatamente la data di ultima modifica, tracciare ogni tipo di asset e fare il cleanup best-effort solo dopo il write dati. La sanificazione può preservare video incorporati soltanto tramite una allowlist stretta di provider e percorsi HTTPS.