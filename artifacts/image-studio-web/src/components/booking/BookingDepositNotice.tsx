import { ShieldCheck } from 'lucide-react';

interface Props {
  enabled?: boolean;
  amountCents?: number | null;
  requiresApproval?: boolean;
  compact?: boolean;
}

export function BookingDepositNotice({ enabled, amountCents, requiresApproval = true, compact = false }: Props) {
  if (enabled !== true) return null;
  const validAmount = Number.isSafeInteger(amountCents) && Number(amountCents) > 0;
  const amount = validAmount
    ? (Number(amountCents) / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
    : null;

  return (
    <aside
      aria-label="Acconto per la prenotazione"
      data-testid={compact ? 'booking-deposit-notice' : 'booking-deposit-introduction'}
      className="rounded-xl border border-primary/25 bg-primary/5 p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-2 text-sm leading-relaxed">
          <h3 className="font-semibold text-foreground">
            {amount ? `Un acconto di ${amount} per riservare il tuo shooting` : 'Per questo shooting è previsto un acconto'}
          </h3>
          {!validAmount ? (
            <p className="text-muted-foreground">L’importo è da verificare con lo studio prima di procedere al pagamento.</p>
          ) : (
            <>
              <p className="text-muted-foreground">
                {requiresApproval
                  ? 'Dopo l’approvazione dello studio riceverai via email il link per versare l’acconto con PayPal e confermare il tuo appuntamento.'
                  : 'Dopo aver scelto giorno e orario e inserito i tuoi dati, potrai versare l’acconto con PayPal per confermare l’appuntamento.'}
                {' '}L’acconto verrà scalato dal totale del servizio, non è un costo aggiuntivo.
              </p>
              {!compact && (
                <>
                  <p className="text-muted-foreground">
                    È un piccolo impegno che ci aiuta a limitare le assenze e a organizzare gli appuntamenti con cura,
                    dando a tutti la possibilità di partecipare all’evento.
                  </p>
                  <p className="text-muted-foreground">Puoi decidere i prodotti anche in studio: l’acconto per riservare il posto resta lo stesso.</p>
                </>
              )}
            </>
          )}
          {!compact && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-primary/15 pt-3">
              <img
                src="https://www.paypalobjects.com/paypal-ui/logos/svg/paypal-wordmark-color.svg"
                alt="PayPal"
                width={86}
                height={23}
                className="h-auto w-[86px] shrink-0"
              />
              <span className="text-xs text-muted-foreground">Pagamento dell’acconto tramite PayPal</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
