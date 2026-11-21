import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { CampaignPaymentFormValues } from '@/lib/campaign-payment-settings';

interface Props {
  value: CampaignPaymentFormValues;
  onChange: (value: CampaignPaymentFormValues) => void;
  error: string | null;
}

export default function CampaignPaymentSettings({ value, onChange, error }: Props) {
  const summary = value.richiedeApprovazione
    ? value.richiedeAcconto
      ? 'Richiesta → tua approvazione → email per pagare entro un’ora → conferma dopo l’incasso.'
      : 'Richiesta → tua approvazione → conferma, senza acconto.'
    : value.richiedeAcconto
      ? 'Scelta dello slot → pagamento immediato con PayPal → conferma dopo l’incasso.'
      : 'Conferma automatica della prenotazione, senza acconto.';

  return (
    <section className="space-y-3 border-t pt-4" aria-labelledby="campaign-payments-title">
      <div>
        <h3 id="campaign-payments-title" className="text-base font-semibold">Conferma e acconto</h3>
        <p className="text-xs text-muted-foreground">Queste impostazioni valgono solo per questa campagna.</p>
      </div>
      <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
        <div className="min-w-0 space-y-1">
          <Label htmlFor="campaign-approval">Richiedi la mia approvazione</Label>
          <p id="campaign-approval-help" className="text-xs text-muted-foreground">
            Esamina le richieste prima della conferma o della richiesta di pagamento.
          </p>
        </div>
        <Switch
          id="campaign-approval"
          aria-describedby="campaign-approval-help"
          checked={value.richiedeApprovazione}
          onCheckedChange={checked => onChange({ ...value, richiedeApprovazione: checked })}
        />
      </div>
      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <Label htmlFor="campaign-deposit">Richiedi un acconto</Label>
            <p id="campaign-deposit-help" className="text-xs text-muted-foreground">
              Scegli un importo fisso per riservare lo shooting, indipendente dai prodotti.
            </p>
          </div>
          <Switch
            id="campaign-deposit"
            aria-describedby="campaign-deposit-help"
            checked={value.richiedeAcconto}
            onCheckedChange={checked => onChange({ ...value, richiedeAcconto: checked })}
          />
        </div>
        {value.richiedeAcconto && (
          <div className="max-w-sm space-y-2">
            <Label htmlFor="campaign-deposit-amount">Importo acconto (€) *</Label>
            <Input
              id="campaign-deposit-amount"
              type="text"
              inputMode="decimal"
              placeholder="Es. 25,00"
              required
              value={value.accontoImportoEuro}
              onChange={event => onChange({ ...value, accontoImportoEuro: event.target.value })}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'campaign-deposit-error' : 'campaign-deposit-amount-help'}
            />
            <p id="campaign-deposit-amount-help" className="text-xs text-muted-foreground">
              Puoi usare la virgola o il punto, con al massimo due decimali.
            </p>
            {error && <p id="campaign-deposit-error" role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
        )}
        {value.richiedeAcconto && (
          <div className="flex items-start justify-between gap-4 border-t pt-3">
            <div className="min-w-0 space-y-1">
              <Label htmlFor="campaign-deposit-recovery">Invita a riprenotare se l’acconto scade</Label>
              <p id="campaign-deposit-recovery-help" className="text-xs text-muted-foreground">
                Un’email un’ora dopo la scadenza, con le disponibilità aggiornate.
                Non parte se il cliente ha già pagato o riprenotato o se la campagna è chiusa.
                Massimo un invito per indirizzo email in questa campagna, solo per nuove scadenze dopo l’attivazione.
              </p>
            </div>
            <Switch
              id="campaign-deposit-recovery"
              aria-describedby="campaign-deposit-recovery-help"
              checked={value.emailRecuperoAcconto === true}
              onCheckedChange={checked => onChange({ ...value, emailRecuperoAcconto: checked })}
            />
          </div>
        )}
      </div>
      <div className="space-y-2 rounded-lg bg-muted/50 p-3 text-sm">
        <p className="font-medium">Flusso configurato</p>
        <p className="break-words text-muted-foreground" aria-live="polite">{summary}</p>
        <p className="text-xs text-muted-foreground">
          Il cliente può sempre decidere i prodotti in studio. Se attivo, l’acconto resta richiesto.
        </p>
      </div>
    </section>
  );
}
