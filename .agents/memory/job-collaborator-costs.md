---
name: Collaborator costs in Job margins
description: Accounting rule for assigned collaborator compensation, advances, and Job net margin.
---

# Costi collaboratori nel margine Job

**Regola:** il margine del Job sottrae il compenso complessivo degli incarichi accettati, anche quando è stato pagato solo un acconto. Gli acconti e i saldi registrati indicano la quota già pagata e riducono il residuo; non sono costi aggiuntivi da sommare al compenso.

Gli incarichi in attesa o rifiutati non sono inclusi. Nella pratica, un collaboratore può comunque lavorare senza aver premuto “Accetta” nell’app: l’admin deve poter aggiornare lo stato dell’incarico dal pannello Costi Lavoro, così il compenso entra nel margine corretto. Se una voce manuale di tipo `collaboratore` ha lo stesso importo del compenso accettato, va trattata una volta sola nel totale.

**Why:** il margine deve rappresentare tutti i costi concordati del lavoro, non soltanto le uscite già registrate; sommare anche gli acconti al compenso intero gonfierebbe i costi.

**How to apply:** quando si calcolano i costi o il margine di un Job, aggiungere i compensi degli incarichi accettati, mostrare separatamente pagato e residuo e deduplicare le voci manuali di collaboratore. Nel pannello Costi Lavoro, consentire all’admin di correggere lo stato di accettazione quando l’accordo è avvenuto fuori dall’app. Evitare di conteggiare il movimento di cassa del pagamento come un secondo costo.
