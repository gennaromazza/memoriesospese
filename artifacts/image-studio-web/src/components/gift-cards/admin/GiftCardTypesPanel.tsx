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
                {type.sellOnline ? (
                  onlineVisibility(type).visible
                    ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100" title={onlineVisibility(type).reason}>Sul sito</Badge>
                    : <Badge variant="outline" className="border-amber-400 text-amber-800" title={onlineVisibility(type).reason}>Sito: non visibile</Badge>
                ) : null}
              </span>
            </button>
          ))}
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
      />

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
