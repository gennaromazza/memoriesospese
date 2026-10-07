import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  GIFT_CARD_THEME_KEYS,
  GIFT_CARD_TYPE_LINE2_MAX,
  GIFT_CARD_TYPE_TITLE_MAX,
  formatGiftCardPrice,
  giftCardThemeFromSeasonalTheme,
  validateGiftCardTypeInput,
  type GiftCardThemeKey,
  type GiftCardTypeDto,
  type GiftCardTypeInput,
  type GiftCardValidityMode,
} from '@shared/gift-card-types';
import { getAllCampaigns } from '@/lib/booking-campaigns';
import { giftCardsApi } from '@/features/gift-cards/gift-cards-api';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GiftCardMini } from '../GiftCardArt';
import { GIFT_CARD_THEMES } from '../giftCardThemes';
import { centsToEuros, errorText, eurosToCents, formatDay } from './giftCardAdminShared';

const NO_CAMPAIGN = '__none__';

const EMPTY_TYPE: GiftCardTypeInput = {
  name: '',
  description: '',
  title: '',
  line2: '',
  kind: 'prodotto',
  priceCents: 0,
  theme: 'classico',
  campaignId: null,
  validityMode: 'none',
  validityDate: null,
  sellUntil: null,
  sellOnline: false,
  sellInStudio: true,
  active: true,
};

function toInput(type: GiftCardTypeDto): GiftCardTypeInput {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = type;
  return input;
}

export default function GiftCardTypesPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const types = useQuery({ queryKey: ['gift-card-types'], queryFn: giftCardsApi.listTypes });
  const campaigns = useQuery({ queryKey: ['gift-card-campaigns'], queryFn: getAllCampaigns });

  const [selectedId, setSelectedId] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<GiftCardTypeInput>(EMPTY_TYPE);
  const [priceText, setPriceText] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (selectedId === null && types.data) {
      const first = types.data[0];
      if (first) {
        setSelectedId(first.id);
        setDraft(toInput(first));
        setPriceText(centsToEuros(first.priceCents));
      } else {
        setSelectedId('new');
      }
    }
  }, [selectedId, types.data]);

  const select = (type: GiftCardTypeDto) => {
    setSelectedId(type.id);
    setDraft(toInput(type));
    setPriceText(centsToEuros(type.priceCents));
    setFieldErrors({});
  };
  const startNew = () => {
    setSelectedId('new');
    setDraft(EMPTY_TYPE);
    setPriceText('');
    setFieldErrors({});
  };
  const patch = (changes: Partial<GiftCardTypeInput>) => setDraft(current => ({ ...current, ...changes }));

  const save = useMutation({
    mutationFn: async () => {
      const input = { ...draft, priceCents: eurosToCents(priceText) };
      const { issues } = validateGiftCardTypeInput(input);
      if (issues.length) {
        setFieldErrors(Object.fromEntries(issues.map(issue => [issue.field, issue.message])));
        throw new Error('Controlla i campi evidenziati.');
      }
      setFieldErrors({});
      return selectedId && selectedId !== 'new' ? giftCardsApi.updateType(selectedId, input) : giftCardsApi.createType(input);
    },
    onSuccess: saved => {
      void queryClient.invalidateQueries({ queryKey: ['gift-card-types'] });
      setSelectedId(saved.id);
      toast({ title: 'Tipo salvato', description: 'Le card già vendute non cambiano.' });
    },
    onError: error => toast({ title: 'Salvataggio non riuscito', description: errorText(error), variant: 'destructive' }),
  });

  if (types.isLoading) return <Skeleton className="h-96 w-full" />;
  if (types.isError) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6 text-sm text-red-700">{errorText(types.error)}</CardContent>
      </Card>
    );
  }

  const campaignList = campaigns.data ?? [];
  const chosenCampaign = campaignList.find(item => item.id === draft.campaignId);
  const error = (field: string) => (fieldErrors[field] ? <p className="text-xs text-red-600">{fieldErrors[field]}</p> : null);

  const chooseCampaign = (value: string) => {
    if (value === NO_CAMPAIGN) {
      patch({ campaignId: null, validityMode: draft.validityMode === 'campaign' ? 'none' : draft.validityMode });
      return;
    }
    const campaign = campaignList.find(item => item.id === value);
    patch({
      campaignId: value,
      theme: giftCardThemeFromSeasonalTheme(campaign?.temaStagionale),
      validityMode: draft.validityMode === 'none' ? 'campaign' : draft.validityMode,
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)_240px]">
      <Card className="h-fit">
        <CardHeader><CardTitle className="text-base">Il tuo catalogo</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(types.data ?? []).map(type => (
            <button
              key={type.id}
              type="button"
              aria-pressed={selectedId === type.id}
              onClick={() => select(type)}
              className={`w-full rounded-lg border p-3 text-left transition ${selectedId === type.id ? 'border-primary ring-2 ring-primary' : 'hover:bg-muted/50'}`}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold">{type.name}</span>
                <span className="text-sm">{formatGiftCardPrice(type.priceCents)}</span>
              </span>
              <span className="mt-1 flex flex-wrap gap-1">
                {type.active ? null : <Badge variant="outline">Nascosta</Badge>}
                {type.sellInStudio ? <Badge variant="secondary">Studio</Badge> : null}
                {type.sellOnline ? <Badge variant="secondary">Online</Badge> : null}
              </span>
            </button>
          ))}
          <Button type="button" variant="outline" className="w-full" onClick={startNew}>Nuovo tipo</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{selectedId === 'new' ? 'Nuovo tipo di gift card' : 'Modifica tipo'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="gct-name">Nome nel catalogo</Label>
            <Input id="gct-name" value={draft.name} onChange={event => patch({ name: event.target.value })} />
            {error('name')}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gct-desc">Cosa include</Label>
            <Textarea id="gct-desc" rows={2} value={draft.description} onChange={event => patch({ description: event.target.value })} />
            {error('description')}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="gct-title">Titolo sulla card</Label>
              <Input id="gct-title" maxLength={GIFT_CARD_TYPE_TITLE_MAX} value={draft.title} onChange={event => patch({ title: event.target.value })} />
              {error('title')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gct-line2">Seconda riga</Label>
              <Input id="gct-line2" maxLength={GIFT_CARD_TYPE_LINE2_MAX} value={draft.line2} onChange={event => patch({ line2: event.target.value })} />
              {error('line2')}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="gct-kind">Tipo</Label>
              <Select value={draft.kind} onValueChange={value => patch({ kind: value as GiftCardTypeInput['kind'] })}>
                <SelectTrigger id="gct-kind"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="prodotto">Prodotto o servizio</SelectItem>
                  <SelectItem value="importo">Importo fisso</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gct-price">Prezzo di vendita (€)</Label>
              <Input id="gct-price" inputMode="decimal" value={priceText} onChange={event => setPriceText(event.target.value)} />
              {error('priceCents')}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="gct-campaign">Campagna</Label>
              <Select value={draft.campaignId ?? NO_CAMPAIGN} onValueChange={chooseCampaign}>
                <SelectTrigger id="gct-campaign"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CAMPAIGN}>Nessuna campagna</SelectItem>
                  {campaignList.map(campaign => (
                    <SelectItem key={campaign.id} value={campaign.id}>{campaign.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {campaigns.isError ? <p className="text-xs text-red-600">Impossibile caricare le campagne.</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gct-theme">Tema grafico</Label>
              <Select value={draft.theme} onValueChange={value => patch({ theme: value as GiftCardThemeKey })}>
                <SelectTrigger id="gct-theme"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GIFT_CARD_THEME_KEYS.map(key => (
                    <SelectItem key={key} value={key}>{GIFT_CARD_THEMES[key].name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {error('theme')}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="gct-valid">Validità</Label>
              <Select value={draft.validityMode} onValueChange={value => patch({ validityMode: value as GiftCardValidityMode })}>
                <SelectTrigger id="gct-valid"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="campaign">Fino a fine campagna</SelectItem>
                  <SelectItem value="date">Data scelta da me</SelectItem>
                  <SelectItem value="none">Nessuna scadenza</SelectItem>
                </SelectContent>
              </Select>
              {draft.validityMode === 'campaign' && chosenCampaign ? (
                <p className="text-xs text-muted-foreground">La campagna finisce il {formatDay(chosenCampaign.dataFine)}.</p>
              ) : null}
              {error('validityMode')}
            </div>
            {draft.validityMode === 'date' ? (
              <div className="space-y-1.5">
                <Label htmlFor="gct-date">Scade il</Label>
                <Input id="gct-date" type="date" value={draft.validityDate ?? ''} onChange={event => patch({ validityDate: event.target.value || null })} />
                {error('validityDate')}
              </div>
            ) : null}
          </div>
          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-semibold">Dove si vende</legend>
            <label className="flex items-center gap-3 text-sm">
              <Checkbox checked={draft.sellInStudio} onCheckedChange={value => patch({ sellInStudio: value === true })} />
              In studio, dal pannello
            </label>
            <label className="flex items-center gap-3 text-sm">
              <Checkbox checked={draft.sellOnline} onCheckedChange={value => patch({ sellOnline: value === true })} />
              Online, sulla pagina /regala (pagamento con PayPal)
            </label>
            {draft.sellOnline ? (
              <div className="space-y-1.5 pl-7">
                <Label htmlFor="gct-sell-until">Vendibile online fino al</Label>
                <Input id="gct-sell-until" type="date" value={draft.sellUntil ?? ''} onChange={event => patch({ sellUntil: event.target.value || null })} />
                <p className="text-xs text-muted-foreground">
                  Dopo questa data il regalo sparisce dal sito. Serve per non vendere card che non fai in tempo a usare. Se lo lasci vuoto resta in vendita finché la card è valida.
                </p>
                {error('sellUntil')}
              </div>
            ) : null}
            <label className="flex items-center gap-3 text-sm">
              <Checkbox checked={draft.active} onCheckedChange={value => patch({ active: value === true })} />
              Attiva nel catalogo
            </label>
          </fieldset>
          <div className="flex items-center gap-3">
            <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? 'Salvataggio…' : 'Salva'}
            </Button>
            <p className="text-xs text-muted-foreground">Le card già vendute non cambiano.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader><CardTitle className="text-base">Anteprima</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <GiftCardMini theme={draft.theme} name={draft.title || 'Titolo della card'} small={draft.line2} />
          <p className="text-xs text-muted-foreground">
            {chosenCampaign ? `Tema suggerito dalla campagna ${chosenCampaign.nome}.` : 'Senza campagna puoi scegliere il tema che preferisci.'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
