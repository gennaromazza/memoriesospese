---
name: Mockup material catalog
description: Origine delle varianti tessuto usate dai renderer Custodia, girevole e Plaza.
---
I renderer girevole e Plaza usano intenzionalmente le varianti del catalogo Custodia; i loro modelli identificano asset e flusso, ma non espongono un proprio array `variants`.

**Why:** i renderer legacy caricano lo stesso catalogo materiali; validare contro un catalogo inesistente o inventare varianti separate rifiuterebbe configurazioni valide.

**How to apply:** mantenere una validazione condivisa delle varianti e separare invece gli schemi di configurazione specifici del renderer.