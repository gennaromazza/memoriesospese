# Browser admin ricordati

## Comportamento

- Il browser viene ricordato per 30 giorni solo dopo una verifica passkey riuscita e una scelta esplicita dell'amministratore.
- La fiducia vale per quel browser e quell'account; non sostituisce il login Firebase e non si applica alla Preview.
- Il browser conserva un cookie `Secure`, `HttpOnly` e `SameSite=Lax`; il server conserva solo l'hash del segreto e il record revocabile.
- A ogni ripristino il server controlla account, scadenza, revoca e data di invalidazione. Il claim Firebase contiene solo l'ID del record, non il segreto.
- La revoca individuale o globale invalida anche l'accesso Firestore. Uscire dall'account non revoca la fiducia; “Dimentica dispositivo” sì.
- Gestione delle passkey, dispositivi e richieste QR richiede una verifica WebAuthn fresca; una sessione ricordata non basta.

## Ordine di rilascio

1. Pubblicare prima le regole Firestore aggiornate. Rimangono compatibili con le sessioni passkey già esistenti e autorizzano le sessioni ricordate solo quando il record server-side è attivo.
2. Rilasciare l'API che crea e ripristina i record dei dispositivi.
3. Rilasciare il client web che offre la scelta e ripristina la sessione prima di caricare le schermate admin.
4. Verificare accesso da due browser, logout, scadenza e revoca individuale/globale.

Non abilitare il nuovo flusso prima che le regole Firestore siano attive. In caso di rollback, interrompere prima l'emissione di nuove fiducie e revocare quelle attive; mantenere le regole compatibili finché non restano record validi. Le regole non devono mai concedere accesso basandosi soltanto su dati locali del browser.
