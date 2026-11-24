import { useMemo, useState } from 'react';
import type { BookingCampaignFE } from '@shared/booking-types';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  previewManualBookingRecovery, sendManualBookingRecovery,
  type ManualBookingRecoveryCandidate, type ManualBookingRecoveryPreview,
} from '@/lib/bookings';
import { MailPlus, RefreshCw } from 'lucide-react';

const EXCLUSION_LABELS: Record<string, string> = {
  gia_inviata: 'Già contattato',
  esito_in_corso_o_incerto: 'Invio in corso o con esito incerto',
  campagna_non_prenotabile: 'Campagna non prenotabile',
  scadenza_non_verificabile: 'Scadenza non verificabile',
  prenotazione_non_scaduta: 'Prenotazione non scaduta',
  checkout_non_scaduto: 'Checkout non scaduto',
  prenotazione_non_trovata: 'Prenotazione non trovata',
  pagamento_o_modifica_da_verificare: 'Pagamento o modifica da verificare',
  destinatario_gia_contattato: 'Destinatario già contattato',
  destinatario_duplicato_nella_selezione: 'Stesso destinatario già presente nell’elenco',
  riprenotata_o_non_idonea: 'Riprenotato o non idoneo',
};

function CandidateRow({
  candidate, checked, disabled, onChange,
}: {
  candidate: ManualBookingRecoveryCandidate;
  checked?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <label className="flex gap-3 border-b py-3 last:border-b-0">
      {onChange && (
        <input
          type="checkbox"
          checked={!!checked}
          disabled={disabled}
          onChange={event => onChange(event.target.checked)}
          aria-label={`Seleziona ${candidate.name || candidate.email || candidate.bookingId}`}
          className="mt-1 h-4 w-4"
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{candidate.name || 'Nome non disponibile'}</span>
        <span className="block break-all text-sm text-muted-foreground">{candidate.email || 'Email non disponibile'}</span>
        {candidate.reason && (
          <span className="mt-1 block text-xs text-amber-700">
            {EXCLUSION_LABELS[candidate.reason] || 'Escluso per verifica di sicurezza'}
          </span>
        )}
      </span>
    </label>
  );
}

export function BookingRecoveryManualPanel({
  campaigns, allowSending = import.meta.env.PROD,
}: { campaigns: BookingCampaignFE[]; allowSending?: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [campaignId, setCampaignId] = useState('');
  const [preview, setPreview] = useState<ManualBookingRecoveryPreview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [outcomes, setOutcomes] = useState<Array<{
    bookingId: string; status: string; reason?: string; name?: string; email?: string;
  }> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const eligibleCampaigns = useMemo(
    () => campaigns.filter(campaign => campaign.attiva && campaign.richiedeAcconto),
    [campaigns],
  );

  const loadPreview = async (keepOutcomes = false) => {
    if (!campaignId) return;
    setLoading(true);
    setError('');
    if (!keepOutcomes) setOutcomes(null);
    try {
      const result = await previewManualBookingRecovery(campaignId);
      setPreview(result);
      setSelected([]);
    } catch (cause) {
      setPreview(null);
      setSelected([]);
      setError(cause instanceof Error ? cause.message.replace(/^\d{3}:\s*/, '') : 'Anteprima non disponibile.');
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    if (!campaignId || !selected.length) return;
    setLoading(true);
    setError('');
    try {
      const result = await sendManualBookingRecovery(campaignId, selected);
      const sentOutcomes = result.outcomes.map(outcome => ({
        ...outcome,
        ...preview?.eligible.find(candidate => candidate.bookingId === outcome.bookingId),
      }));
      setConfirmOpen(false);
      await loadPreview(true);
      setSelected([]);
      setOutcomes(sentOutcomes);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message.replace(/^\d{3}:\s*/, '') : 'Invio non completato.');
    } finally {
      setLoading(false);
    }
  };

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setCampaignId('');
      setPreview(null);
      setSelected([]);
      setOutcomes(null);
      setError('');
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} data-testid="button-manual-booking-recovery">
        <MailPlus className="mr-2 h-4 w-4" />
        Invita a riprenotare
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Invito manuale a riprenotare</DialogTitle>
            <DialogDescription>
              Seleziona una campagna e controlla destinatari ed esclusioni prima di confermare.
              Questo invio è separato dai promemoria automatici.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={campaignId} onValueChange={value => {
                setCampaignId(value);
                setPreview(null);
                setSelected([]);
                setOutcomes(null);
              }}>
                <SelectTrigger aria-label="Campagna">
                  <SelectValue placeholder="Scegli campagna" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleCampaigns.map(campaign => (
                    <SelectItem key={campaign.id} value={campaign.id}>{campaign.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => void loadPreview()} disabled={!campaignId || loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Mostra destinatari
              </Button>
            </div>

            {!allowSending && (
              <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                In sviluppo puoi verificare l’anteprima, ma l’invio reale è disabilitato.
              </p>
            )}
            {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}

            {preview && (
              <>
                <section aria-label="Destinatari idonei" className="rounded-md border p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">Destinatari idonei ({preview.eligible.length})</h3>
                      <p className="text-sm text-muted-foreground">Selezionati: {selected.length}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setSelected(selected.length === preview.eligible.length
                        ? [] : preview.eligible.slice(0, 100).map(item => item.bookingId))}
                      disabled={!preview.eligible.length}
                    >
                      {selected.length === preview.eligible.length ? 'Deseleziona tutti' : 'Seleziona tutti'}
                    </Button>
                  </div>
                  {preview.eligible.length > 100 && (
                    <p className="mb-2 text-xs text-muted-foreground">
                      Puoi selezionare fino a 100 destinatari per ogni invio.
                    </p>
                  )}
                  {preview.eligible.length ? preview.eligible.map(candidate => (
                    <CandidateRow
                      key={candidate.bookingId}
                      candidate={candidate}
                      checked={selected.includes(candidate.bookingId)}
                      disabled={!selected.includes(candidate.bookingId) && selected.length >= 100}
                      onChange={checked => setSelected(current => checked
                        ? current.length < 100 ? [...current, candidate.bookingId] : current
                        : current.filter(id => id !== candidate.bookingId))}
                    />
                  )) : <p className="py-3 text-sm text-muted-foreground">Nessun destinatario idoneo.</p>}
                </section>

                <section aria-label="Esclusioni" className="rounded-md border p-4">
                  <h3 className="mb-2 font-semibold">Esclusi ({preview.excluded.length})</h3>
                  {preview.excluded.length ? (
                    <div className="max-h-48 overflow-y-auto">
                      {preview.excluded.map(candidate => <CandidateRow key={candidate.bookingId} candidate={candidate} />)}
                    </div>
                  ) : <p className="text-sm text-muted-foreground">Nessuna esclusione.</p>}
                </section>
              </>
            )}

            {outcomes && (
              <section aria-label="Esito invii" className="rounded-md border p-4">
                <h3 className="mb-2 font-semibold">Esito invii</h3>
                {outcomes.map(outcome => {
                  const candidate = preview?.eligible.find(item => item.bookingId === outcome.bookingId);
                  return (
                    <div key={outcome.bookingId} className="flex justify-between gap-3 border-b py-2 last:border-b-0">
                      <span className="min-w-0 truncate">{candidate?.name || outcome.name || candidate?.email || outcome.email || outcome.bookingId}</span>
                      <span className={outcome.status === 'sent' ? 'text-green-700' : 'text-amber-700'}>
                        {outcome.status === 'sent' ? 'Inviata' : outcome.status === 'unknown'
                          ? 'Esito da verificare' : outcome.status === 'skipped' ? 'Non inviata' : outcome.status}
                      </span>
                    </div>
                  );
                })}
                <p className="mt-2 text-xs text-muted-foreground">
                  Gli esiti incerti non vengono ritentati automaticamente.
                </p>
              </section>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)}>Chiudi</Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!selected.length || loading || !allowSending}
            >
              Conferma invio ({selected.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confermi l’invio manuale?</AlertDialogTitle>
            <AlertDialogDescription>
              Verranno contattati {selected.length} destinatari selezionati. La richiesta verrà ricontrollata
              prima di ogni email; chi risulta pagato, riprenotato o con pagamento incerto sarà escluso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Annulla</AlertDialogCancel>
            <AlertDialogAction disabled={loading} onClick={event => {
              event.preventDefault();
              void submit();
            }}>Invia email</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
