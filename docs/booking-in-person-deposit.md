# Acconto incassato di persona

Quando una campagna richiede l'acconto PayPal ma il cliente paga di persona (contanti, carta/POS,
bonifico), l'admin registra l'incasso dal gestionale. L'importo è libero.

## Dove si trova
- Scheda prenotazione ancora da approvare, su una campagna con acconto: pulsante **Acconto incassato di persona**
  (alternativa ad "Approva").
- Pannello "Acconto e pagamento" di una richiesta già approvata e non ancora pagata (finestra di un'ora aperta).

## Cosa fa (una sola transazione, `POST /api/booking/:id/payment/in-person`)
- Conferma la prenotazione e registra `depositPayment` con `provider: "in_person"`, metodo, importo e ricevuta.
- Chiude il checkout PayPal collegato: il link già inviato non può più incassare.
- Scrive l'incasso in cassa (entrata, metodo scelto) e la ricevuta `bookingInPersonDeposits/<id>`.
- Accoda calendario ed email di conferma, come per l'acconto PayPal.
- Aggiorna le guardie del giorno: nessun'altra prenotazione può occupare lo slot.
- Lo stesso `requestId` ripetuto (doppio clic, rete incerta) non registra due volte; dati diversi con lo stesso id sono rifiutati.

## Quando si ferma (nessun effetto)
Prenotazione non in attesa, acconto già registrato o da riconciliare, richiesta scaduta (410), pagamento PayPal
in corso o già incassato (prima si verifica PayPal), shooting già iniziato, slot occupato da altri.

### Pagamento PayPal rimasto "incerto"
Se PayPal va in timeout durante una cattura, il tentativo resta incerto (il denaro potrebbe essere stato addebitato) e il comando
si ferma. "Verifica esito PayPal" (solo admin) lo conclude quando PayPal conferma che l'ordine non ha **nessuna** cattura, il
tentativo non è in corso ed è iniziato da almeno 10 minuti. Con una cattura in sospeso, completata o un tentativo recente o
storico (senza data di inizio) resta bloccato. La verifica fatta dal cliente non conclude mai nulla. Se PayPal elaborasse
comunque più tardi una richiesta in volo, il registro la mette in cassa e la segnala, senza una seconda conferma.

## Se il cliente paga comunque col link PayPal
Il denaro entra in cassa, la prenotazione non viene confermata una seconda volta, la ricevuta di persona resta quella
della prenotazione e il pagamento PayPal è tracciato in `duplicatePayPalPayment` con `paymentReviewRequired`.
Il rimborso PayPal è manuale: nessun movimento di denaro parte senza conferma dell'admin.

## Ordine e cassa
- L'acconto di persona viene copiato nell'ordine collegato (riga con `source: booking_in_person_deposit`), senza un
  secondo movimento di cassa. La riga non si può eliminare dall'ordine.
- Le prenotazioni manuali create con un acconto registrano ora anche cassa e ricevuta.
- La registrazione dei pagamenti sugli ordini (`register-payment`, `delete-payment`) è atomica; con `requestId` è idempotente.
- Le previsioni di incasso non contano due volte una prenotazione che ha già un ordine.

## Limiti noti
- L'acconto pagato con gift card resta sulla prenotazione e non passa nell'ordine.
- Annullamento e rimborso di un acconto di persona: l'admin lo gestisce direttamente con il cliente (nessun rimborso PayPal).
