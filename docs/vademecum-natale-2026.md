# Vademecum di Natale 2026

Regole dello studio da far leggere ai clienti prima di prenotare e da linkare nelle email.

## Dove compare
- **Pagina pubblica:** `/vademecum-natale-2026` (raggiungibile dal sito, non indicizzata da Google).
  Il testo e' in `artifacts/image-studio-web/src/features/vademecum/natale-2026.ts`.
- **Modulo di prenotazione:** per le campagne di Natale una casella obbligatoria "Ho letto il vademecum di Natale"
  con il link. Senza spunta il pulsante di invio resta disattivato (vale anche per il pagamento immediato).
- **Email ai clienti:** blocco "Prima di venire a trovarci" col link nelle email di richiesta ricevuta, richiesta di
  acconto e conferma prenotazione.

## Quali campagne
Regola in `lib/shared-src/seasonal-vademecum.ts`: tema stagionale "natale" oppure "natal…" nel nome della campagna.
Un anno diverso dal 2026 nel nome (es. "Natale 2025") la esclude. Nelle email si conosce solo il nome della
campagna: il nome deve contenere "Natale".

## Limiti noti
- L'accettazione del vademecum non viene salvata sulla prenotazione (serve una modifica dello schema delle API):
  e' una casella obbligatoria nel modulo e un link nelle email.
- Il sistema non decide i rimborsi (li decide l'admin).

## Spostamento a 4 giorni (Natale 2026)
Per le campagne di Natale 2026 il cambio autonomo dell'appuntamento e' consentito fino a **4 giorni** prima dello
shooting (esattamente 4 giorni e' ancora consentito); per le altre campagne resta **24 ore**.
- Regola: `rescheduleNoticeFor` in `lib/shared-src/seasonal-vademecum.ts`, usata da `rescheduleView` (e quindi
  da pagina di gestione e prenotazione del nuovo orario).
- Condizioni mostrate nel modulo e salvate sulla prenotazione: versione `shooting-natale-2026-v1` (4 giorni).
  Le prenotazioni gia' fatte conservano il testo storico (`shooting-2026-11-v1`, 24 ore) e si possono annullare
  come prima: l'annullamento online riconosce tutte le versioni registrate (`isKnownBookingConditions`).
- Il server salva sempre le condizioni della campagna, anche se il browser invia la versione generica.
- La pagina di gestione deduce la campagna dal nome: serve "Natale" nel nome per mostrare "4 giorni" nel testo
  informativo (il blocco sul server funziona comunque per tema stagionale o nome).
