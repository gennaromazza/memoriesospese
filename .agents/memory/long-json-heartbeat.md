---
name: Heartbeat JSON per operazioni lunghe
description: Come mantenere vive le risposte JSON durante generazioni IA che superano il timeout inattivo del proxy.
---

Le operazioni IA lunghe esposte come singola risposta JSON devono inviare periodicamente whitespace, che resta JSON valido, e forzare il flush prima del payload conclusivo.

**Why:** una generazione Real Wedding con verifiche esterne e revisioni del modello può restare senza output per minuti; il proxy può allora interrompere la richiesta e restituire la propria pagina HTML, anche se il backend sta ancora lavorando.

**How to apply:** per endpoint sincroni lunghi usa header anti-buffering, heartbeat whitespace e cleanup del timer; il client deve inoltre rifiutare envelope senza risultato e trasformare eventuale HTML infrastrutturale in un messaggio breve.