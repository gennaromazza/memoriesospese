import { useState, type ReactNode } from 'react';
import { Check, Trash2 } from 'lucide-react';
import {
  GIFT_CARD_THEME_KEYS,
  GIFT_CARD_TYPE_LINE2_MAX,
  GIFT_CARD_TYPE_TITLE_MAX,
  formatGiftCardPrice,
  giftCardThemeFromSeasonalTheme,
  type GiftCardThemeKey,
  type GiftCardTypeInput,
  type GiftCardValidityMode,
} from '@shared/gift-card-types';
import type { BookingCampaignFE } from '@shared/booking-types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GIFT_CARD_THEMES } from '../giftCardThemes';
import GiftCardItemsEditor from './GiftCardItemsEditor';
import { centsToEuros, eurosToCents, formatDay, onlineVisibility } from './giftCardAdminShared';

const NO_CAMPAIGN = '__none__';

const STEPS = [
  { id: 'regalo', label: 'Il regalo' },
  { id: 'prodotti', label: 'Prodotti e prezzo' },
  { id: 'grafica', label: 'Grafica' },
  { id: 'validita', label: 'Validità' },
  { id: 'vendita', label: 'Dove si vende' },
] as const;

interface Props {
  isNew: boolean;
  draft: GiftCardTypeInput;
  patch: (changes: Partial<GiftCardTypeInput>) => void;
  priceText: string;
  setPriceText: (value: string) => void;
  fieldErrors: Record<string, string>;
  campaigns: BookingCampaignFE[];
  campaignsFailed: boolean;
  saving: boolean;
  onSave: () => void;
  /** Presente solo quando si modifica un tipo già salvato. */
  onDelete?: () => void;
}

/** Ciò che manca in un passaggio, detto in parole semplici. */
function stepProblems(index: number, draft: GiftCardTypeInput, priceText: string): string[] {
  const problems: string[] = [];
  if (index === 0) {
    if (!draft.name.trim()) problems.push('Dai un nome al regalo.');
    if (!draft.title.trim()) problems.push('Scrivi il titolo che comparirà sulla card.');
  }
  if (index === 1 && eurosToCents(priceText) <= 0) problems.push('Indica il prezzo di vendita.');
  if (index === 3) {
    if (draft.validityMode === 'campaign' && !draft.campaignId) problems.push('Per scadere a fine campagna scegli una campagna nel passaggio Grafica.');
    if (draft.validityMode === 'date' && !draft.validityDate) problems.push('Scegli la data di scadenza.');
  }
  return problems;
}

function Channel({ on, title, text, onToggle }: { on: boolean; title: string; text: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={`flex w-full items-start gap-3 rounded-lg border p-4 text-left transition ${on ? 'border-primary bg-primary/5 ring-2 ring-primary' : 'hover:bg-muted/50'}`}
    >
      <span className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded border ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'}`} aria-hidden="true">
        {on ? <Check className="h-3.5 w-3.5" /> : null}
      </span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{text}</span>
      </span>
    </button>
  );
}

/** Creazione e modifica di un tipo di gift card, un passaggio alla volta. */
export default function GiftCardTypeWizard({
  isNew, draft, patch, priceText, setPriceText, fieldErrors, campaigns, campaignsFailed, saving, onSave, onDelete,
}: Props) {
  const [step, setStep] = useState(0);
  const [tried, setTried] = useState(false);
  const last = step === STEPS.length - 1;
  const chosenCampaign = campaigns.find(item => item.id === draft.campaignId);
  const problems = stepProblems(step, draft, priceText);
  const allProblems = STEPS.flatMap((_, index) => stepProblems(index, draft, priceText));
  const visibility = onlineVisibility(draft);
  const error = (field: string) => (fieldErrors[field] ? <p className="text-xs text-red-600">{fieldErrors[field]}</p> : null);

  const chooseCampaign = (value: string) => {
    if (value === NO_CAMPAIGN) {
      patch({ campaignId: null, validityMode: draft.validityMode === 'campaign' ? 'none' : draft.validityMode });
      return;
    }
    const campaign = campaigns.find(item => item.id === value);
    patch({
      campaignId: value,
      theme: giftCardThemeFromSeasonalTheme(campaign?.temaStagionale),
      validityMode: draft.validityMode === 'none' ? 'campaign' : draft.validityMode,
    });
  };

  const next = () => {
    if (problems.length) { setTried(true); return; }
    setTried(false);
    setStep(Math.min(STEPS.length - 1, step + 1));
  };
  const goTo = (index: number) => { setTried(false); setStep(index); };

  let content: ReactNode;
  if (step === 0) {
    content = (
      <>
        <p className="text-sm text-muted-foreground">Come si chiama il regalo e cosa leggerà chi lo riceve sulla card.</p>
        <div className="space-y-1.5">
          <Label htmlFor="gct-name">Nome nel catalogo</Label>
          <Input id="gct-name" value={draft.name} placeholder="Per esempio Foto di Natale + tela" onChange={event => patch({ name: event.target.value })} />
          <p className="text-xs text-muted-foreground">Lo vedi solo tu, nel pannello.</p>
          {error('name')}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="gct-title">Titolo sulla card</Label>
            <Input id="gct-title" maxLength={GIFT_CARD_TYPE_TITLE_MAX} value={draft.title} placeholder="Foto di Natale" onChange={event => patch({ title: event.target.value })} />
            {error('title')}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gct-line2">Seconda riga (facoltativa)</Label>
            <Input id="gct-line2" maxLength={GIFT_CARD_TYPE_LINE2_MAX} value={draft.line2} placeholder="con stampa su tela" onChange={event => patch({ line2: event.target.value })} />
            {error('line2')}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gct-desc">Cosa include, in parole tue</Label>
          <Textarea id="gct-desc" rows={3} value={draft.description} placeholder="Un servizio in studio e una stampa su tela 30×40" onChange={event => patch({ description: event.target.value })} />
          <p className="text-xs text-muted-foreground">Chi riceve il regalo lo legge nella sezione «Cosa include».</p>
          {error('description')}
        </div>
      </>
    );
  } else if (step === 1) {
    content = (
      <>
        <p className="text-sm text-muted-foreground">Collega i prodotti del tuo catalogo: chi riceve vede nome, descrizione e foto, mai il prezzo.</p>
        <GiftCardItemsEditor items={draft.items} onChange={items => patch({ items })} onUseTotal={cents => setPriceText(centsToEuros(cents))} />
        {error('items')}
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="gct-price">Prezzo di vendita del regalo (€)</Label>
          <Input id="gct-price" inputMode="decimal" value={priceText} onChange={event => setPriceText(event.target.value)} />
          {error('priceCents')}
        </div>
      </>
    );
  } else if (step === 2) {
    content = (
      <>
        <p className="text-sm text-muted-foreground">Se il regalo si usa dentro una campagna, collegala: tema e scadenza si adattano.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="gct-campaign">Campagna</Label>
            <Select value={draft.campaignId ?? NO_CAMPAIGN} onValueChange={chooseCampaign}>
              <SelectTrigger id="gct-campaign"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CAMPAIGN}>Nessuna campagna</SelectItem>
                {campaigns.map(campaign => <SelectItem key={campaign.id} value={campaign.id}>{campaign.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            {campaignsFailed ? <p className="text-xs text-red-600">Impossibile caricare le campagne.</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gct-theme">Tema grafico</Label>
            <Select value={draft.theme} onValueChange={value => patch({ theme: value as GiftCardThemeKey })}>
              <SelectTrigger id="gct-theme"><SelectValue /></SelectTrigger>
              <SelectContent>
                {GIFT_CARD_THEME_KEYS.map(key => <SelectItem key={key} value={key}>{GIFT_CARD_THEMES[key].name}</SelectItem>)}
              </SelectContent>
            </Select>
            {error('theme')}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {chosenCampaign ? `Tema suggerito dalla campagna ${chosenCampaign.nome}: puoi cambiarlo.` : 'Senza campagna puoi scegliere il tema che preferisci. Vedi l\'anteprima a destra.'}
        </p>
      </>
    );
  } else if (step === 3) {
    content = (
      <>
        <p className="text-sm text-muted-foreground">Fino a quando si può usare il regalo dopo l'acquisto.</p>
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
            {draft.validityMode === 'campaign' && chosenCampaign ? <p className="text-xs text-muted-foreground">La campagna finisce il {formatDay(chosenCampaign.dataFine)}.</p> : null}
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
      </>
    );
  } else {
    content = (
      <>
        <p className="text-sm text-muted-foreground">Scegli dove si può comprare. Puoi attivarli entrambi.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Channel
            on={draft.sellInStudio}
            title="In studio"
            text="Lo vendi tu al banco dal pannello, incassi come vuoi e stampi il cartoncino da consegnare in mano."
            onToggle={() => patch({ sellInStudio: !draft.sellInStudio })}
          />
          <Channel
            on={draft.sellOnline}
            title="Sul sito, pagina /regala"
            text="I clienti lo comprano da soli e pagano con PayPal. Il regalo arriva per email, subito o nel giorno scelto."
            onToggle={() => patch({ sellOnline: !draft.sellOnline })}
          />
        </div>
        {draft.sellOnline ? (
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="gct-sell-until">Vendibile sul sito fino al (facoltativo)</Label>
            <Input id="gct-sell-until" type="date" value={draft.sellUntil ?? ''} onChange={event => patch({ sellUntil: event.target.value || null })} />
            <p className="text-xs text-muted-foreground">Dopo questa data il regalo sparisce dal sito. Serve per non vendere card che non fai in tempo a usare.</p>
            {error('sellUntil')}
          </div>
        ) : null}
        <label className="flex items-center gap-3 text-sm">
          <Checkbox checked={draft.active} onCheckedChange={value => patch({ active: value === true })} />
          Attivo nel catalogo (se lo spegni sparisce da studio e sito)
        </label>

        <div className="space-y-2 rounded-lg border bg-muted/30 p-4 text-sm" aria-live="polite">
          <p className="font-semibold">Riepilogo</p>
          <p><b>{draft.name || 'Senza nome'}</b> · {eurosToCents(priceText) > 0 ? formatGiftCardPrice(eurosToCents(priceText)) : 'prezzo mancante'} · {draft.items.length ? `${draft.items.length} prodott${draft.items.length === 1 ? 'o' : 'i'} del catalogo` : 'nessun prodotto collegato'}</p>
          <p className={draft.sellInStudio && draft.active ? 'text-emerald-700' : 'text-muted-foreground'}>
            In studio: {draft.sellInStudio && draft.active ? 'sì, compare in «Vendi in studio»' : 'no'}
          </p>
          <p className={visibility.visible ? 'text-emerald-700' : 'text-amber-700'}>
            Sul sito: {visibility.visible ? 'sì' : 'no'}. {visibility.reason}
          </p>
          {draft.sellOnline && !draft.items.length && !draft.description.trim() ? (
            <p className="text-amber-700">Consiglio: aggiungi un prodotto o una descrizione, così chi compra e chi riceve sa cosa c'è nel regalo.</p>
          ) : null}
          {allProblems.length ? <p className="text-red-700">Prima di salvare: {allProblems.join(' ')}</p> : null}
        </div>
      </>
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-lg">{isNew ? 'Nuovo tipo di gift card' : 'Modifica tipo'}</CardTitle>
          {onDelete ? (
            <Button type="button" variant="outline" size="sm" className="text-red-700 hover:text-red-800" onClick={onDelete}>
              <Trash2 className="mr-2 h-4 w-4" />Elimina questo tipo
            </Button>
          ) : null}
        </div>
        <ol className="flex flex-wrap gap-2" aria-label="Passaggi">
          {STEPS.map((item, index) => {
            const done = index < step;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={index === step ? 'step' : undefined}
                  onClick={() => goTo(index)}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${index === step ? 'border-primary bg-primary text-primary-foreground' : done ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'hover:bg-muted/60'}`}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-background/20 text-[11px]">{done ? <Check className="h-3 w-3" /> : index + 1}</span>
                  {item.label}
                </button>
              </li>
            );
          })}
        </ol>
      </CardHeader>
      <CardContent className="space-y-5">
        {content}
        {tried && problems.length ? <p className="text-sm text-red-600" role="alert">{problems.join(' ')}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <Button type="button" variant="ghost" disabled={step === 0} onClick={() => goTo(step - 1)}>Indietro</Button>
          {last ? (
            <div className="flex items-center gap-3">
              <p className="text-xs text-muted-foreground">Le card già vendute non cambiano.</p>
              <Button type="button" disabled={saving || allProblems.length > 0} onClick={onSave}>{saving ? 'Salvataggio…' : isNew ? 'Crea il regalo' : 'Salva modifiche'}</Button>
            </div>
          ) : (
            <Button type="button" onClick={next}>Avanti</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
