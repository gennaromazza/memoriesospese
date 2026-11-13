---
name: Ripristino tessuti Quadrobook
description: Conservare correttamente le scelte separate del tessuto della scatola e dell'album quando si riapre il mockup.
---

Quadrobook salva `materialId` per scatola e cornici e `albumMaterialId` per l'album. Se gli ID differiscono, il renderer deve ripristinare prima il tessuto della scatola solo sul ruolo `box`, poi quello dell'album solo sul ruolo `album`. Se coincidono o `albumMaterialId` manca, applicare l'unico tessuto a entrambi.

Il riepilogo cliente deve mostrare i due tessuti separatamente quando gli ID differiscono; non descrivere come condiviso il tessuto della scatola.

**Why:** Applicare il materiale della scatola anche all'album sovrascrive una scelta salvata; il confronto col mockup persistito la interpreta come modifica locale e può disabilitare la conferma senza una vera modifica dell'utente.

**Why:** Un riepilogo che mostra solo il tessuto della scatola nasconde una configurazione valida con due rivestimenti diversi e può confondere il cliente sulle superfici.

**How to apply:** Mantenere allineati ripristino, riepilogo cliente, `currentConfiguration()` e test per ID uguali e distinti.
