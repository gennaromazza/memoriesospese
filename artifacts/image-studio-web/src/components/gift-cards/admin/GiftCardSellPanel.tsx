import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Printer } from 'lucide-react';
import {
  GIFT_CARD_MESSAGE_MAX,
  GIFT_CARD_NAME_MAX,
  formatGiftCardPrice,
  type GiftCardDto,
  type GiftCardPaymentMethod,
} from '@shared/gift-card-types';
import { getAllCampaigns } from '@/lib/booking-campaigns';
import { createUrl } from '@/lib/basePath';
import { giftCardsApi } from '@/features/gift-cards/gift-cards-api';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GiftCardCartoncino } from '../GiftCardCartoncino';
import {
  PAYMENT_OPTIONS,
  endOfDayIso,
  errorText,
  openInNewTab,
  typeExpiryIso,
  typeExpiryLabel,
} from './giftCardAdminShared';

type ExpiryMode = 'type' | 'date' | 'none';

export default function GiftCardSellPanel({ onCreateType }: { onCreateType?: () => void } = {}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const types = useQuery({ queryKey: ['gift-card-types'], queryFn: giftCardsApi.listTypes });
  const campaigns = useQuery({ queryKey: ['gift-card-campaigns'], queryFn: getAllCampaigns });

  const sellable = useMemo(() => (types.data ?? []).filter(type => type.active && type.sellInStudio), [types.data]);
  const [typeId, setTypeId] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [message, setMessage] = useState('');
  const [payment, setPayment] = useState<GiftCardPaymentMethod>('contante');
  const [expiryMode, setExpiryMode] = useState<ExpiryMode>('type');
  const [expiryDate, setExpiryDate] = useState('');
  const [sold, setSold] = useState<GiftCardDto | null>(null);
  const [buyerFirstName, setBuyerFirstName] = useState('');
  const [buyerLastName, setBuyerLastName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');

  useEffect(() => {
    if (!sellable.some(type => type.id === typeId)) setTypeId(sellable[0]?.id ?? '');
  }, [sellable, typeId]);

  const type = sellable.find(item => item.id === typeId);
  const campaignList = campaigns.data ?? [];
  const typeDefaultsToNoExpiry = type?.validityMode === 'none';

  const previewExpiry = useMemo(() => {
    if (!type) return null;
    if (expiryMode === 'none') return null;
    if (expiryMode === 'date') return expiryDate ? endOfDayIso(expiryDate) : null;
    return typeExpiryIso(type, campaignList);
  }, [type, expiryMode, expiryDate, campaignList]);

  const sell = useMutation({
    mutationFn: () =>
      giftCardsApi.sell({
        typeId,
        recipientName: recipientName.trim(),
        message: message.trim(),
        paymentMethod: payment,
        ...(expiryMode === 'none' ? { noExpiry: true } : {}),
        ...(expiryMode === 'date' ? { expiresOn: expiryDate } : {}),
        ...(buyerEmail.trim()
          ? { buyer: { firstName: buyerFirstName.trim(), lastName: buyerLastName.trim(), email: buyerEmail.trim(), phone: buyerPhone.trim() } }
          : {}),
      }),
    onSuccess: card => {
      setSold(card);
      void queryClient.invalidateQueries({ queryKey: ['gift-cards-issued'] });
      toast({
        title: card.status === 'attiva' ? 'Gift card attivata' : 'Gift card creata',
        description: card.status === 'attiva' ? 'L\'incasso è stato registrato in cassa.' : 'Resta in attesa finché non confermi il pagamento.',
      });
    },
    onError: error => toast({ title: 'Vendita non riuscita', description: errorText(error), variant: 'destructive' }),
  });

  const reset = () => {
    setSold(null);
    setRecipientName('');
    setMessage('');
    setPayment('contante');
    setExpiryMode('type');
    setExpiryDate('');
    setBuyerFirstName('');
    setBuyerLastName('');
    setBuyerEmail('');
    setBuyerPhone('');
  };

  if (types.isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }
  if (types.isError) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6 text-sm text-red-700">{errorText(types.error)}</CardContent>
      </Card>
    );
  }

  if (sold) {
    return (
      <Card>
        <CardContent className="mx-auto flex max-w-md flex-col items-center gap-5 py-8 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" aria-hidden="true" />
          <div>
            <h3 className="font-playfair text-2xl">
              {sold.status === 'attiva' ? 'Incassato, cartoncino pronto' : 'Card creata, in attesa di pagamento'}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {sold.typeName} · {formatGiftCardPrice(sold.valueCents)} · codice <span className="font-mono">{sold.code}</span>
            </p>
          </div>
          <div className="w-full max-w-[320px]">
            <GiftCardCartoncino
              theme={sold.theme}
              title={sold.title}
              line2={sold.line2}
              recipientName={sold.recipientName}
              message={sold.message}
              validUntil={sold.expiresAt}
              code={sold.code}
            />
          </div>
          <ol className="w-full space-y-2 text-left text-sm">
            <li><b className="mr-2">1</b>Stampa il cartoncino su carta 15 × 20 cm</li>
            <li><b className="mr-2">2</b>Incolla la card nel riquadro in alto</li>
            <li><b className="mr-2">3</b>Consegna al cliente: chi lo riceve scansiona il QR e apre il regalo</li>
          </ol>
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={() => openInNewTab(`/admin/gift-card/stampa/${encodeURIComponent(sold.code)}`, createUrl)}>
              <Printer className="mr-2 h-4 w-4" />Stampa il cartoncino
            </Button>
            <Button variant="outline" onClick={reset}>Vendi un'altra card</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!sellable.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center text-sm text-muted-foreground">
          <p>Nessun tipo di gift card è in vendita in studio.</p>
          {onCreateType ? <Button onClick={onCreateType}>Crea un tipo di gift card</Button> : null}
        </CardContent>
      </Card>
    );
  }

  const paymentHint = PAYMENT_OPTIONS.find(option => option.value === payment)?.hint;
  const buyerIncomplete = !!buyerEmail.trim() && (!buyerFirstName.trim() || !buyerLastName.trim());
  const canSell = !!type && !sell.isPending && (expiryMode !== 'date' || !!expiryDate) && !buyerIncomplete;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Nuova vendita al banco</CardTitle>
          <CardDescription>Il codice nasce quando confermi, e la card è attiva subito.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold">1 · Cosa regala il cliente</legend>
            {sellable.map(item => (
              <button
                key={item.id}
                type="button"
                aria-pressed={item.id === typeId}
                onClick={() => { setTypeId(item.id); setExpiryMode('type'); }}
                className={`flex w-full items-start justify-between gap-4 rounded-lg border p-3 text-left transition ${item.id === typeId ? 'border-primary ring-2 ring-primary' : 'hover:bg-muted/50'}`}
              >
                <span>
                  <span className="block text-sm font-semibold">{item.name}</span>
                  <span className="block text-xs text-muted-foreground">{item.description || typeExpiryLabel(item, campaignList)}</span>
                </span>
                <span className="text-sm font-semibold">{formatGiftCardPrice(item.priceCents)}</span>
              </button>
            ))}
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="mb-2 text-sm font-semibold">2 · Per chi è</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="gc-sell-to">Nome di chi riceve</Label>
                <Input id="gc-sell-to" value={recipientName} maxLength={GIFT_CARD_NAME_MAX} placeholder="Per esempio Giulia" onChange={event => setRecipientName(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gc-sell-expiry">Valida fino a</Label>
                <Select value={expiryMode} onValueChange={value => setExpiryMode(value as ExpiryMode)}>
                  <SelectTrigger id="gc-sell-expiry"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="type">{type ? typeExpiryLabel(type, campaignList) : 'Come da tipo'}</SelectItem>
                    <SelectItem value="date">Data scelta da me</SelectItem>
                    {typeDefaultsToNoExpiry ? null : <SelectItem value="none">Nessuna scadenza</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {expiryMode === 'date' ? (
              <div className="space-y-1.5">
                <Label htmlFor="gc-sell-date">Data di scadenza</Label>
                <Input id="gc-sell-date" type="date" value={expiryDate} onChange={event => setExpiryDate(event.target.value)} />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="gc-sell-msg">Messaggio sul cartoncino</Label>
              <Textarea id="gc-sell-msg" value={message} maxLength={GIFT_CARD_MESSAGE_MAX} rows={2} placeholder="Una riga scritta a mano per chi riceve" onChange={event => setMessage(event.target.value)} />
              <p className="text-xs text-muted-foreground">{message.length}/{GIFT_CARD_MESSAGE_MAX} caratteri</p>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-semibold">3 · Chi compra (facoltativo)</legend>
            <p className="text-xs text-muted-foreground">Con l'email, chi compra viene salvato tra i clienti e l'incasso gli viene collegato.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="gc-buyer-first">Nome</Label>
                <Input id="gc-buyer-first" value={buyerFirstName} maxLength={60} onChange={event => setBuyerFirstName(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gc-buyer-last">Cognome</Label>
                <Input id="gc-buyer-last" value={buyerLastName} maxLength={60} onChange={event => setBuyerLastName(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gc-buyer-email">Email</Label>
                <Input id="gc-buyer-email" type="email" value={buyerEmail} onChange={event => setBuyerEmail(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gc-buyer-phone">Telefono</Label>
                <Input id="gc-buyer-phone" type="tel" value={buyerPhone} maxLength={30} onChange={event => setBuyerPhone(event.target.value)} />
              </div>
            </div>
            {buyerIncomplete ? <p className="text-xs text-red-600">Per salvare il cliente servono nome, cognome ed email.</p> : null}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold">4 · Incasso</legend>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Metodo di pagamento">
              {PAYMENT_OPTIONS.map(option => (
                <Button key={option.value} type="button" size="sm" variant={payment === option.value ? 'default' : 'outline'} aria-pressed={payment === option.value} onClick={() => setPayment(option.value)}>
                  {option.label}
                </Button>
              ))}
            </div>
            {paymentHint ? <p className="text-xs text-muted-foreground">{paymentHint}</p> : null}
          </fieldset>
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-lg">Anteprima del cartoncino</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {type ? (
            <div className="mx-auto w-full max-w-[300px]">
              <GiftCardCartoncino
                theme={type.theme}
                title={type.title}
                line2={type.line2}
                recipientName={recipientName.trim()}
                message={message.trim()}
                validUntil={previewExpiry}
                code="ANTEPRIMA"
                codeLabel="generato alla conferma"
              />
            </div>
          ) : null}
          <Button className="w-full" size="lg" disabled={!canSell} onClick={() => sell.mutate()}>
            {sell.isPending ? 'Un momento…' : type ? `Incassa ${formatGiftCardPrice(type.priceCents)} e prepara il cartoncino` : 'Scegli un regalo'}
          </Button>
          <p className="text-xs text-muted-foreground">L'incasso entra in cassa con la categoria «Gift card».</p>
        </CardContent>
      </Card>
    </div>
  );
}
