import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import {
  GIFT_CARD_THEME_KEYS,
  GIFT_CARD_VISUAL_STYLE_LABELS,
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
import ProductsManager from '@/components/ProductsManager';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GiftCardMini } from '../GiftCardArt';
import GiftCardTypeWizard from './GiftCardTypeWizard';
import { GIFT_CARD_THEMES } from '../giftCardThemes';
import { centsToEuros, errorText, eurosToCents, onlineVisibility } from './giftCardAdminShared';

const NO_CAMPAIGN = '__none__';

const EMPTY_TYPE: GiftCardTypeInput = {
  name: '',
  description: '',
  title: '',
  line2: '',
  kind: 'prodotto',
  priceCents: 0,
  items: [],
  theme: 'classico',
  visualStyle: 'pacchetto',
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [productEditRequest, setProductEditRequest] = useState<{ productId: string; requestKey: number } | null>(null);
  const productEditRequestKey = useRef(0);

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
  const editProduct = (productId: string) => {
    setProductEditRequest({ productId, requestKey: ++productEditRequestKey.current });
  };

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

  const remove = useMutation({
    mutationFn: () => giftCardsApi.deleteType(selectedId as string),
    onSuccess: result => {
      const removed = selectedId;
      const remaining = (types.data ?? []).filter(item => item.id !== removed);
      void queryClient.invalidateQueries({ queryKey: ['gift-card-types'] });
      setConfirmDelete(false);
      if (remaining[0]) select(remaining[0]);
      else startNew();
      toast({
        title: 'Tipo eliminato',
        description: result.soldCards ? `Le ${result.soldCards} card già vendute restano valide.` : undefined,
      });
    },
    onError: error => {
      setConfirmDelete(false);
      toast({ title: 'Eliminazione non riuscita', description: errorText(error), variant: 'destructive' });
    },
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
          {(types.data ?? []).map(type => {
            const selected = selectedId === type.id;
            const visibility = onlineVisibility(type);
            return (
              <div key={type.id} className={`rounded-lg border p-2 transition ${selected ? 'border-primary ring-2 ring-primary' : 'hover:bg-muted/50'}`}>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => select(type)}
                    className="min-w-0 flex-1 rounded-md p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="break-words text-sm font-semibold">{type.name}</span>
                      <span className="shrink-0 text-sm">{formatGiftCardPrice(type.priceCents)}</span>
                    </span>
                  </button>
                  <Button type="button" size="sm" variant={selected ? 'outline' : 'ghost'} onClick={() => select(type)} aria-label={`Modifica ${type.name}`}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    Modifica
                  </Button>
                </div>
                <span className="mt-1 flex flex-wrap gap-1">
                  {type.active ? null : <Badge variant="outline">Nascosta</Badge>}
                  <Badge variant="outline">{GIFT_CARD_VISUAL_STYLE_LABELS[type.visualStyle]}</Badge>
                  {type.sellInStudio ? <Badge variant="secondary">Studio</Badge> : null}
                  {type.sellOnline ? (
                    visibility.visible
                      ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100" title={visibility.reason}>Sul sito</Badge>
                      : <Badge variant="outline" className="border-amber-400 text-amber-800" title={visibility.reason}>Sito: non visibile</Badge>
                  ) : null}
                </span>
              </div>
            );
          })}
          {(types.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Non hai ancora nessun tipo. Segui i passaggi a destra: sarà il primo del catalogo.</p>
          ) : null}
          <Button type="button" variant="outline" className="w-full" onClick={startNew}>Nuovo tipo</Button>
        </CardContent>
      </Card>

      <GiftCardTypeWizard
        key={selectedId ?? 'new'}
        isNew={selectedId === 'new'}
        draft={draft}
        patch={patch}
        priceText={priceText}
        setPriceText={setPriceText}
        fieldErrors={fieldErrors}
        campaigns={campaignList}
        campaignsFailed={campaigns.isError}
        saving={save.isPending}
        onSave={() => save.mutate()}
        onEditProduct={editProduct}
        onDelete={selectedId && selectedId !== 'new' ? () => setConfirmDelete(true) : undefined}
      />

      <Card className="h-fit">
        <CardHeader><CardTitle className="text-base">Anteprima</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <GiftCardMini theme={draft.theme} name={draft.title || 'Titolo della card'} small={draft.line2} />
          <p className="text-xs text-muted-foreground">
            {`Stile vetrina: ${GIFT_CARD_VISUAL_STYLE_LABELS[draft.visualStyle]}. `}
            {chosenCampaign ? `Tema suggerito dalla campagna ${chosenCampaign.nome}.` : 'Il tema grafico cambia i colori, non la confezione.'}
          </p>
        </CardContent>
      </Card>

      <Dialog open={confirmDelete} onOpenChange={open => { if (!open) setConfirmDelete(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminare questo tipo?</DialogTitle>
            <DialogDescription>
              «{draft.name || 'Senza nome'}» sparisce dal catalogo e non si potrà più vendere. Le card già vendute restano valide e conservano titolo, prezzo e prodotti. Se vuoi solo toglierlo dalla vendita, apri «Dove si vende» e spegni «Attivo nel catalogo».
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Indietro</Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
              {remove.isPending ? 'Elimino…' : 'Elimina il tipo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {productEditRequest ? (
        <div className="hidden">
          <ProductsManager
            key={productEditRequest.requestKey}
            autoEditId={productEditRequest.productId}
            onChanged={() => { void queryClient.invalidateQueries({ queryKey: ['gift-card-products'] }); }}
          />
        </div>
      ) : null}
    </div>
  );
}
