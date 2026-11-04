---
name: Ripristino tessuti Quadrobook
description: Conservare correttamente le scelte separate del tessuto della scatola e dell'album quando si riapre il mockup.
---

Quadrobook salva `materialId` per scatola e cornici e `albumMaterialId` per l'album. Se gli ID differiscono, il renderer deve ripristinare prima il tessuto della scatola solo sul ruolo `box`, poi quello dell'album solo sul ruolo `album`. Se coincidono o `albumMaterialId` manca, applicare l'unico tessuto a entrambi.

**Why:** Applicare il materiale della scatola anche all'album sovrascrive una scelta salvata; il confronto col mockup persistito la interpreta come modifica locale e può disabilitare la conferma senza una vera modifica dell'utente.

**How to apply:** Mantenere allineati il ripristino `apply` del renderer Quadrobook, il formato di `currentConfiguration()` e un test che copra ID uguali e distinti.
