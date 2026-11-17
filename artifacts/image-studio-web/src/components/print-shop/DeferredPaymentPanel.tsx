import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, WalletCards } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { MANUAL_PAYMENT_METHOD_LABELS, printPaymentAmounts, printPaymentStatusLabel } from '@/features/print-shop/order-display';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';

export interface DeferredPanelOrder {
  id: string;
  orderNumber?: string;
  quoteFingerprint?: string;
  manualAcceptanceEligibility?: { canAccept?: boolean; reason?: string; snapshotHash?: string; requiresLowResolutionConfirmation?: boolean };
  printShop?: {
    adminAcceptance?: { acceptedAt?: unknown; by?: string; note?: string; amountCents?: number };
    items?: Array<{ sku?: string; formatLabel?: string; productName?: string; finish?: string; copyCount?: number; assignments?: Array<{ copies: number }> }>;
  };
  totals?: { totalCents?: number };
  totale?: number;
  payment?: {
    status?: string;
    method?: string;
    collectedCents?: number;
    dueCents?: number;
    deferredAuthorization?: { authorizedAt?: unknown; by?: string; note?: string; amountCents?: number };
    manualReceipt?: { method?: string; receivedAt?: unknown; recordedAt?: unknown; by?: string; note?: string; amountCents?: number };
  };
  fulfillment?: { status?: string; method?: 'studio_pickup' | 'shipping' };
  deferredPaymentEligibility?: { canAuthorize?: boolean; canRestore?: boolean; reason?: string };
}

type Action = 'accept-draft' | 'accept-and-defer' | 'deferred-payment' | 'restore' | 'collect';

export interface DeferredPaymentPanelHandle {
  openPaymentAction: () => void;
}

/** The lab shortcut and payment panel must offer the same server-approved action. */
export function paymentNextStep(order: DeferredPanelOrder): { action?: Action; explanation: string } {
  if (order.fulfillment?.status === 'cancelled') {
    return order.deferredPaymentEligibility?.canRestore
      ? { action: 'restore', explanation: 'Ordine annullato: conferma prima il ripristino. Il pagamento al ritiro richiede poi un’autorizzazione separata.' }
      : { explanation: order.deferredPaymentEligibility?.reason || 'Ordine annullato: verifica se è possibile ripristinarlo oppure crea un nuovo ordine.' };
  }
  if (['paid', 'deferred'].includes(order.payment?.status || '')) return { explanation: '' };
  if (order.manualAcceptanceEligibility?.canAccept) return {
    action: 'accept-draft',
    explanation: 'Il cliente ha confermato fuori dal sito? Verifica e accetta la bozza, poi autorizza separatamente il pagamento alla consegna/al ritiro. Non viene registrato alcun incasso.',
  };
  if (order.deferredPaymentEligibility?.canAuthorize) return {
    action: 'deferred-payment',
    explanation: 'Puoi autorizzare il pagamento alla consegna/al ritiro con nota e conferma. Il saldo resta interamente da incassare.',
  };
  return { explanation: order.manualAcceptanceEligibility?.reason || order.deferredPaymentEligibility?.reason ||
    'Idoneità non comunicata dal server. Aggiorna il dettaglio per verificare i requisiti prima di procedere.' };
}

const euro = (cents: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const fmt = (value: unknown) => {
  const raw = value as { toDate?: () => Date; seconds?: number; _seconds?: number } | string | number | null | undefined;
  if (!raw) return '—';
  const date = typeof raw === 'object'
    ? (raw.toDate ? raw.toDate() : new Date(((raw.seconds ?? raw._seconds) ?? 0) * 1000))
    : new Date(raw);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};
const localInput = (date = new Date()) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export const DeferredPaymentPanel = forwardRef<DeferredPaymentPanelHandle, {
  order: DeferredPanelOrder;
  onChanged: (updatedOrder?: DeferredPanelOrder) => Promise<void> | void;
}>(function DeferredPaymentPanel({ order, onChanged }, ref) {
  const { toast } = useToast();
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [qualityConfirmed, setQualityConfirmed] = useState(false);
  const [method, setMethod] = useState('cash');
  const [receivedAt, setReceivedAt] = useState(localInput());
  const submitting = useRef(false);
  const acceptanceCompleted = useRef(false);
  const panelRef = useRef<HTMLElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const total = order.totals?.totalCents ?? Math.round((order.totale || 0) * 100);
  const amounts = printPaymentAmounts({ ...order, totals: { totalCents: total } });
  const status = order.payment?.status;
  const eligibility = order.deferredPaymentEligibility;
  const manualEligibility = order.manualAcceptanceEligibility;
  const acceptance = order.printShop?.adminAcceptance;
  const canAccept = manualEligibility?.canAccept === true;
  const cancelled = order.fulfillment?.status === 'cancelled';
  const canAuthorize = eligibility?.canAuthorize === true && !cancelled;
  const canRestore = eligibility?.canRestore === true;
  const canCollect = status === 'deferred' && !cancelled;
  const deferredPaymentLabel = order.fulfillment?.method === 'shipping' ? 'alla consegna' : 'al ritiro';
  const receipt = order.payment?.manualReceipt;
  const auth = order.payment?.deferredAuthorization;

  const close = () => { setAction(null); setNote(''); setConfirmed(false); setQualityConfirmed(false); setErrorMessage(''); setMethod('cash'); setReceivedAt(localInput()); };
  const focusPayment = () => {
    const panel = panelRef.current;
    panel?.scrollIntoView({ block: 'center' });
    (panel?.querySelector<HTMLButtonElement>('button[data-payment-next]') || panel)?.focus({ preventScroll: true });
  };
  useImperativeHandle(ref, () => ({
    openPaymentAction() {
      const next = paymentNextStep(order);
      if (next.action) { setErrorMessage(''); setAction(next.action); }
      else focusPayment();
    },
  }), [order]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!action) throw new Error('Azione non selezionata');
      const body: Record<string, unknown> = { note: note.trim(), confirmed: true };
      if (action === 'accept-draft' || action === 'accept-and-defer') {
        body.expectedQuoteFingerprint = order.quoteFingerprint;
        body.expectedSnapshotHash = manualEligibility?.snapshotHash;
        body.expectedTotalCents = total;
        body.lowResolutionConfirmed = qualityConfirmed;
      }
      if (action === 'collect') {
        const date = new Date(receivedAt);
        if (Number.isNaN(date.getTime())) throw new Error('Inserisci una data di incasso valida');
        body.method = method;
        body.receivedAt = date.toISOString();
      }
      if (action === 'accept-and-defer') {
        acceptanceCompleted.current = false;
        await apiRequest('POST', `/api/print-shop/admin/orders/${order.id}/accept-draft`, body);
        acceptanceCompleted.current = true;
        try {
          const response = await apiRequest('POST', `/api/print-shop/admin/orders/${order.id}/deferred-payment`, {
            note: note.trim(), confirmed: true,
          });
          return response.json() as Promise<{ order: DeferredPanelOrder }>;
        } catch (error) {
          const detail = error instanceof Error ? ` ${error.message}` : '';
          throw new Error(`Ordine preso in carico, ma il pagamento ${deferredPaymentLabel} non è stato autorizzato.${detail} Verifica lo stato aggiornato e riprova solo l’autorizzazione.`);
        }
      }
      const response = await apiRequest('POST', `/api/print-shop/admin/orders/${order.id}/${action}`, body);
      return response.json() as Promise<{ order: DeferredPanelOrder }>;
    },
    onSuccess: async (result) => {
      const done = action;
      close();
      await onChanged(result.order);
      toast({
        title: done === 'accept-draft' ? 'Ordine accettato dallo studio'
          : done === 'accept-and-defer' || done === 'deferred-payment' ? `Pagamento ${deferredPaymentLabel} autorizzato`
          : done === 'restore' ? 'Ordine ripristinato' : 'Incasso registrato',
        description: done === 'accept-and-defer' || done === 'deferred-payment'
          ? `L’ordine può essere inviato al laboratorio. ${euro(total)} restano da incassare ${deferredPaymentLabel}.`
          : done === 'restore' || done === 'accept-draft' ? 'Il pagamento alla consegna non è stato autorizzato: fallo dal pannello se serve.' : undefined,
      });
    },
    onError: async (error: Error) => {
      setErrorMessage(error.message);
      const partiallyAccepted = acceptanceCompleted.current;
      if (partiallyAccepted) setAction('deferred-payment');
      // An earlier acceptance (or a response lost after saving) must remain visible.
      await onChanged();
      toast({ title: partiallyAccepted ? 'Ordine accettato, pagamento non autorizzato' : 'Operazione non riuscita', description: error.message, variant: 'destructive' });
    },
    onSettled: () => { submitting.current = false; acceptanceCompleted.current = false; },
  });

  const actionAllowed = action === 'accept-draft' || action === 'accept-and-defer' ? canAccept : action === 'deferred-payment' ? canAuthorize
    : action === 'restore' ? canRestore : action === 'collect' ? canCollect : false;
  const canSubmit = actionAllowed && note.trim().length > 0 && confirmed && !mutation.isPending && (action !== 'collect' || !!receivedAt) &&
    (!['accept-draft', 'accept-and-defer'].includes(action || '') || !manualEligibility?.requiresLowResolutionConfirmation || qualityConfirmed);
  const titles: Record<Action, string> = {
    'accept-draft': 'Accettare l’ordine su richiesta del cliente?',
    'accept-and-defer': `Accettare l’ordine e autorizzare il pagamento ${deferredPaymentLabel}?`,
    'deferred-payment': 'Autorizzare il pagamento alla consegna?',
    restore: 'Ripristinare l’ordine annullato?',
    collect: 'Registrare l’incasso completo',
  };

  return (
    <section ref={panelRef} tabIndex={-1} aria-label="Gestione pagamento" className="rounded-xl border p-4" data-testid="panel-payment">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-stone-900">Pagamento</h3>
          <p className="mt-1 text-sm text-stone-600" data-testid="text-payment-status">{printPaymentStatusLabel(status)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canAccept && <>
            <Button onClick={() => setAction('accept-and-defer')} data-testid="button-accept-and-defer">
              Accetta e autorizza pagamento {deferredPaymentLabel}
            </Button>
            <Button data-payment-next variant="outline" onClick={() => setAction('accept-draft')} data-testid="button-accept-draft">Accetta ordine senza autorizzare il ritiro</Button>
          </>}
          {canAuthorize && <Button data-payment-next variant="outline" onClick={() => setAction('deferred-payment')} data-testid="button-authorize-deferred"><WalletCards className="mr-2 h-4 w-4" />Autorizza pagamento alla consegna</Button>}
          {canRestore && <Button data-payment-next variant="outline" onClick={() => setAction('restore')} data-testid="button-restore-order">Ripristina ordine annullato</Button>}
          {canCollect && <Button onClick={() => setAction('collect')} data-testid="button-collect-deferred">Registra incasso</Button>}
        </div>
      </div>
      {canAccept && <p className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-900" data-testid="manual-acceptance-help">
        Il cliente non ha confermato online? Se ti ha chiesto le stampe per telefono o fuori dal sito, verifica il riepilogo e accetta l’ordine manualmente. Poi puoi autorizzare il pagamento alla consegna.
      </p>}
      {acceptance && <p className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-900" data-testid="text-admin-acceptance">
        Ordine accettato dallo studio il {fmt(acceptance.acceptedAt)}{acceptance.by ? ` da ${acceptance.by}` : ''} su richiesta ricevuta fuori dal sito.{acceptance.note ? ` Nota: ${acceptance.note}` : ''} Non è una conferma online del cliente.
      </p>}
      {!canAccept && !acceptance && manualEligibility?.reason && <p className="mt-3 text-sm text-stone-500" data-testid="text-acceptance-ineligible">
        Accettazione manuale non disponibile: {manualEligibility.reason}
      </p>}
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        <div><dt className="text-stone-500">Totale</dt><dd className="font-semibold">{euro(amounts.totalCents)}</dd></div>
        <div><dt className="text-stone-500">Incassato</dt><dd className="font-semibold">{euro(amounts.collectedCents)}</dd></div>
        <div><dt className="text-stone-500">Da incassare</dt><dd className="font-semibold">{euro(amounts.dueCents)}</dd></div>
      </dl>
      {auth && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Autorizzato il {fmt(auth.authorizedAt)}{auth.by ? ` da ${auth.by}` : ''} per {euro(auth.amountCents ?? total)}.{auth.note ? ` Nota: ${auth.note}` : ''}
        </p>
      )}
      {receipt && (
        <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900" data-testid="text-manual-receipt">
          Incasso manuale: {MANUAL_PAYMENT_METHOD_LABELS[receipt.method || ''] || receipt.method} · {euro(receipt.amountCents ?? total)} ricevuti il {fmt(receipt.receivedAt)}, registrati il {fmt(receipt.recordedAt)}{receipt.by ? ` da ${receipt.by}` : ''}.{receipt.note ? ` Nota: ${receipt.note}` : ''}
        </p>
      )}
      {!canAuthorize && !canCollect && !canRestore && !canAccept && status !== 'paid' && (
        <p className="mt-3 text-sm text-stone-500" data-testid="text-deferred-ineligible">
          {paymentNextStep(order).explanation}
        </p>
      )}

      <Dialog open={!!action} onOpenChange={(open) => !open && !mutation.isPending && close()}>
        <DialogContent onOpenAutoFocus={(event) => {
          event.preventDefault();
          noteRef.current?.focus();
        }} onCloseAutoFocus={(event) => {
          event.preventDefault();
          focusPayment();
        }}>
          <DialogHeader>
            <DialogTitle>{action ? titles[action] : ''}</DialogTitle>
            <DialogDescription>
              {action === 'accept-draft' && `Prendi in carico la configurazione salvata per ${euro(total)} su richiesta ricevuta fuori dal sito. Non registri consensi online del cliente, incassi o un’autorizzazione alla produzione senza pagamento.`}
              {action === 'accept-and-defer' && `Prendi in carico la richiesta ricevuta fuori dal sito e autorizzi la produzione con pagamento ${deferredPaymentLabel}. Non viene registrato alcun incasso: ${euro(total)} resteranno da riscuotere.`}
              {action === 'deferred-payment' && `L’ordine ${order.orderNumber || ''} entra in produzione senza pagamento online. Il totale di ${euro(total)} resta da incassare e non conta come incassato.`}
              {action === 'restore' && 'Il ripristino è separato dall’autorizzazione: non autorizza il pagamento alla consegna in automatico.'}
              {action === 'collect' && `Registra l’incasso completo di ${euro(total)} ricevuto fuori da PayPal.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {errorMessage && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
              {errorMessage} Stato attuale: {printPaymentStatusLabel(status)}.
              {acceptance && ' Ordine già accettato dallo studio: non ripetere l’accettazione.'}
              {!actionAllowed && ` ${paymentNextStep(order).explanation || 'Operazione non più disponibile. Chiudi e verifica il riepilogo aggiornato.'}`}
            </p>}
            {(action === 'accept-draft' || action === 'accept-and-defer') && <div className="rounded-lg border p-3 text-sm" data-testid="manual-acceptance-summary">
              <p className="font-medium">Configurazione da verificare · {euro(total)}</p>
              <ul className="mt-2 space-y-1">{order.printShop?.items?.map((item, index) => <li key={index}>
                {item.productName || item.sku} · {item.formatLabel} · {item.finish === 'matte' ? 'Opaca' : item.finish === 'glossy' ? 'Lucida' : item.finish} · {item.copyCount ?? item.assignments?.reduce((sum, assignment) => sum + assignment.copies, 0) ?? 0} copie
              </li>)}</ul>
            </div>}
            {action === 'collect' && (
              <>
                <div>
                  <Label>Metodo di incasso</Label>
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger data-testid="select-collect-method"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['cash', 'card', 'bank_transfer', 'other'] as const).map((value) => <SelectItem key={value} value={value}>{MANUAL_PAYMENT_METHOD_LABELS[value]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="collect-received-at">Data e ora di incasso</Label>
                  <Input id="collect-received-at" type="datetime-local" value={receivedAt} max={localInput()} onChange={(event) => setReceivedAt(event.target.value)} />
                </div>
              </>
            )}
            <div>
              <Label htmlFor="deferred-note">Nota obbligatoria</Label>
              <Textarea ref={noteRef} id="deferred-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Motivo e riferimenti dell’operazione" data-testid="input-deferred-note" />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} data-testid="checkbox-confirm-deferred" />
              <span>
                {action === 'accept-draft' && 'Confermo la richiesta del cliente ricevuta fuori dal sito e di avere verificato foto, formati, quantità, consegna e importo.'}
                {action === 'accept-and-defer' && `Confermo la richiesta del cliente, la verifica dell’ordine da ${euro(total)} e l’autorizzazione a pagare ${deferredPaymentLabel}. Non ho ancora incassato questo importo.`}
                {action === 'deferred-payment' && `Confermo di autorizzare il pagamento alla consegna per ${euro(total)}.`}
                {action === 'restore' && 'Confermo il ripristino dell’ordine annullato.'}
                {action === 'collect' && `Confermo di aver incassato l’intero importo di ${euro(total)}.`}
              </span>
            </label>
            {(action === 'accept-draft' || action === 'accept-and-defer') && manualEligibility?.requiresLowResolutionConfirmation && <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={qualityConfirmed} onChange={event => setQualityConfirmed(event.target.checked)} data-testid="checkbox-accept-low-resolution" />
              <span>Ho verificato le segnalazioni di bassa risoluzione e confermo di procedere con queste fotografie.</span>
            </label>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={mutation.isPending}>Annulla</Button>
            <Button onClick={() => {
              if (!canSubmit || submitting.current) return;
              submitting.current = true;
              mutation.mutate();
            }} disabled={!canSubmit} data-testid="button-confirm-deferred-action">
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {action === 'accept-and-defer' ? 'Conferma pagamento al ritiro' : 'Conferma'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
});
