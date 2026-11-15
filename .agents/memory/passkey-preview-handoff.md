---
name: Passkey in Preview
description: Sicurezza admin quando la Preview Replit usa un'origine diversa dal dominio WebAuthn di produzione.
---

**Regola:** Per usare il pannello admin dalla Preview, mantenere attiva la MFA di produzione e completare una verifica passkey temporanea sul dominio WebAuthn ufficiale. Non disattivare l'obbligo MFA né tentare di riutilizzare sul dominio Preview una passkey registrata per il sito.

**Why:** La Preview ha un'origine diversa, mentre la sessione Firebase può accedere agli stessi dati live; un bypass allargherebbe l'accesso amministrativo e una passkey è legata al dominio che l'ha registrata.

**How to apply:** Usare un handoff monouso, breve e legato alla sessione Preview, con la passkey verificata sul dominio ufficiale. Separare inoltre Firebase di sviluppo dalla produzione prima di fare test che possono modificare dati.

In origine non ufficiale, saltare il ripristino del cookie “Ricorda dispositivo” e continuare con il controllo passkey normale: l’assenza della fiducia Preview non è un errore che deve bloccare l’app. Il server non deve mai emettere un claim di fiducia per quell’origine; l’accesso resta subordinato alla verifica passkey o all’handoff temporaneo dal dominio ufficiale.

**Why:** Il cookie `__Host-` e la fiducia del dispositivo appartengono al dominio ufficiale. Il rifiuto previsto del ripristino in Preview non deve diventare un blocco totale né un motivo per allargare la fiducia.

**How to apply:** Limitare la fiducia persistente al sito ufficiale; in Preview proseguire solo verso la verifica passkey/handoff e non accettare il cookie come autorizzazione.

La schermata di verifica deve mostrare prima l’azione principale valida per l’origine corrente; recupero e associazione QR restano disponibili sotto “Altre opzioni”. Gli avvisi per aggiornare la sessione compaiono solo quando sono davvero necessari.

**Why:** Il titolare ha approvato una schermata più semplice perché i flussi alternativi e i messaggi ripetuti erano difficili da distinguere, senza voler rimuovere funzioni.

**How to apply:** Preservare le azioni e le condizioni MFA esistenti, ma usare una gerarchia a divulgazione progressiva e testi brevi.
