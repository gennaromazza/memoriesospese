/**
 * Testo mostrato al cliente dopo l'invio di una richiesta ancora da approvare.
 * Se la campagna richiede un acconto, deve dire chiaramente cosa succede dopo l'approvazione:
 * email con il link PayPal, un'ora per pagare, conferma solo a pagamento avvenuto.
 */
export function pendingBookingNextStep(input: { requiresDepositAfterApproval: boolean; depositAmountCents?: number | null }): string {
  if (!input.requiresDepositAfterApproval) {
    return 'La conferma definitiva arriverà via email solo dopo l’approvazione. Controlla anche la cartella spam.';
  }
  const cents = input.depositAmountCents;
  const amount = typeof cents === 'number' && Number.isSafeInteger(cents) && cents > 0
    ? ` di ${(cents / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}` : '';
  return `Dopo l’approvazione dello studio riceverai un’email con il link per versare l’acconto${amount} con PayPal. `
    + 'Avrai un’ora di tempo dall’approvazione: la prenotazione sarà confermata solo dopo il pagamento. '
    + 'Controlla anche la cartella spam.';
}
