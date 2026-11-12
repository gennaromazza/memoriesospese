import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowDownToLine, BadgeCheck, Check, ChevronDown, Image as ImageIcon, Layers3, LoaderCircle, Save, Sparkles } from 'lucide-react';
import {
  COUPON_ARTWORK_PLACEMENTS,
  COUPON_ARTWORK_TEMPLATES,
  createCouponArtworkBlob,
  createCouponArtworkSvg,
  layoutCouponArtworkTerms,
  type CouponArtworkAssetMetadata,
  type CouponArtworkData,
  type CouponArtworkPlacement,
  type CouponArtworkTemplateId,
  type CouponPlacementId,
} from './coupon-artwork';

export interface PrintCouponArtworkStudioProps {
  coupon: CouponArtworkData;
  savedImageUrl?: string | null;
  selectedVariant?: CouponArtworkTemplateId | null;
  selectedPlacementId?: CouponPlacementId | null;
  busy?: boolean;
  onDownload: (blob: Blob, metadata: CouponArtworkAssetMetadata) => void | Promise<void>;
  onSave: (blob: Blob, metadata: CouponArtworkAssetMetadata) => void | Promise<void>;
}

const CHANNELS = [
  { id: 'instagram', title: 'Instagram organico', hint: 'Post nel feed' },
  { id: 'meta', title: 'Meta / Instagram Ads', hint: 'Feed sponsorizzato' },
  { id: 'stories', title: 'Stories / Reels', hint: 'Verticale a schermo intero' },
  { id: 'whatsapp-status', title: 'WhatsApp Status', hint: 'Aggiornamento di stato' },
  { id: 'whatsapp-channel', title: 'WhatsApp Channel', hint: 'Post immagine' },
] as const;

const initialPlacement: CouponPlacementId = 'instagram-organic-34';

function Button({
  children, onClick, disabled, variant = 'solid', testId, type = 'button',
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'solid' | 'outline';
  testId: string;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-transform duration-150 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50 ${
        variant === 'solid'
          ? 'bg-[#314846] text-[#f7f3ea] hover:bg-[#243a38]'
          : 'border border-[#c8c1b3] bg-[#fbf9f4] text-[#354744] hover:bg-[#f1eee6]'
      }`}
    >
      {children}
    </button>
  );
}

function getPlacements(channelId: typeof CHANNELS[number]['id']): CouponArtworkPlacement[] {
  const mapping: Record<typeof CHANNELS[number]['id'], string[]> = {
    instagram: ['instagram-organic-34', 'instagram-organic-square'],
    meta: ['meta-feed-45', 'meta-feed-square'],
    stories: ['stories-reels'],
    'whatsapp-status': ['whatsapp-status'],
    'whatsapp-channel': ['whatsapp-channel-square', 'whatsapp-channel-45'],
  };
  return COUPON_ARTWORK_PLACEMENTS.filter(placement => mapping[channelId].includes(placement.id));
}

function channelForPlacement(placementId?: CouponPlacementId | null): typeof CHANNELS[number]['id'] {
  if (placementId === 'meta-feed-45' || placementId === 'meta-feed-square') return 'meta';
  if (placementId === 'stories-reels') return 'stories';
  if (placementId === 'whatsapp-status') return 'whatsapp-status';
  if (placementId === 'whatsapp-channel-square' || placementId === 'whatsapp-channel-45') return 'whatsapp-channel';
  return 'instagram';
}

export default function PrintCouponArtworkStudio({
  coupon, savedImageUrl, selectedVariant, selectedPlacementId, busy = false, onDownload, onSave,
}: PrintCouponArtworkStudioProps) {
  const [templateId, setTemplateId] = useState<CouponArtworkTemplateId>(selectedVariant || 'contact-sheet');
  const [channelId, setChannelId] = useState<typeof CHANNELS[number]['id']>(channelForPlacement(selectedPlacementId));
  const [placementId, setPlacementId] = useState<CouponPlacementId>(selectedPlacementId || initialPlacement);
  const [working, setWorking] = useState<'download' | 'save' | null>(null);
  const [exportError, setExportError] = useState('');
  const channelPlacements = useMemo(() => getPlacements(channelId), [channelId]);
  const placement = channelPlacements.find(item => item.id === placementId) || channelPlacements[0];
  const compactTerms = layoutCouponArtworkTerms(coupon, placement).compact;
  const artworkSvg = useMemo(
    () => createCouponArtworkSvg(coupon, templateId, placement, { showGuides: true }),
    [coupon, templateId, placement],
  );
  const previewUrl = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artworkSvg)}`, [artworkSvg]);
  const metadata: CouponArtworkAssetMetadata = {
    templateId, placementId: placement.id, width: placement.width, height: placement.height, mimeType: 'image/jpeg',
  };
  const disabled = busy || working !== null;

  const changeChannel = (nextChannel: typeof CHANNELS[number]['id']) => {
    const nextPlacement = getPlacements(nextChannel)[0];
    setChannelId(nextChannel);
    setPlacementId(nextPlacement.id);
  };

  const exportArtwork = async (action: 'download' | 'save') => {
    if (disabled) return;
    setWorking(action);
    setExportError('');
    try {
      const blob = await createCouponArtworkBlob(coupon, templateId, placement);
      if (action === 'download') await onDownload(blob, metadata);
      else await onSave(blob, metadata);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Esportazione non riuscita. Riprova.');
    } finally {
      setWorking(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-[#ded8cc] bg-[#f5f2eb] text-[#354744] shadow-sm" data-testid="coupon-artwork-studio">
      <div className="border-b border-[#ded8cc] bg-[#f9f7f1] px-5 py-5 sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e8ded0] text-[#a65c48]">
              <ImageIcon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[.19em] text-[#a65c48]">Image Studio · Print shop</p>
              <h2 className="mt-1 font-playfair text-2xl font-semibold tracking-tight text-[#314846] sm:text-[28px]">Grafica promozionale</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[#68736e]">Prepara una creatività pronta da pubblicare, con codice e condizioni sempre in vista.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[#d7d1c5] bg-white/60 px-3 py-1.5 text-xs font-semibold text-[#53635e]" data-testid="status-artwork-format">
            <span className="h-2 w-2 rounded-full bg-[#9b7259]" />
            JPEG · ottimizzato
          </div>
        </div>
      </div>

      <div className="grid min-w-0 gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(270px,.78fr)_minmax(0,1.22fr)] lg:gap-8 lg:p-7">
        <div className="min-w-0 space-y-6">
          <div>
            <div className="mb-3 flex items-end justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#a65c48]">01 · Impostazione</p>
                <h3 className="mt-1 text-base font-bold">Dove verrà pubblicata?</h3>
              </div>
              <ChevronDown className="h-4 w-4 text-[#8a938d]" aria-hidden="true" />
            </div>
            <div className="space-y-2" role="group" aria-label="Canale di pubblicazione">
              {CHANNELS.map(channel => {
                const active = channel.id === channelId;
                return (
                  <button
                    type="button"
                    key={channel.id}
                    data-testid={`button-channel-${channel.id}`}
                    aria-pressed={active}
                    onClick={() => changeChannel(channel.id)}
                    className={`flex min-h-[62px] w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                      active ? 'border-[#56736b] bg-[#e6ece6] ring-1 ring-[#56736b]/20' : 'border-[#ded8cc] bg-[#fbf9f4] hover:border-[#a9b9ae]'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-bold">{channel.title}</span>
                      <span className="mt-0.5 block text-xs text-[#78827c]">{channel.hint}</span>
                    </span>
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${active ? 'border-[#4c6c62] bg-[#4c6c62] text-white' : 'border-[#c9c3b7]'}`}>
                      {active && <Check className="h-3 w-3" aria-hidden="true" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-3">
              <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#a65c48]">02 · Formato</p>
              <h3 className="mt-1 text-base font-bold">Dimensioni dell’esportazione</h3>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {channelPlacements.map(item => {
                const active = item.id === placement.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`button-placement-${item.id}`}
                    aria-pressed={active}
                    onClick={() => setPlacementId(item.id)}
                    className={`min-h-[72px] rounded-xl border px-3.5 py-3 text-left transition-colors ${
                      active ? 'border-[#a65c48] bg-[#f5e9e1] ring-1 ring-[#a65c48]/15' : 'border-[#ded8cc] bg-[#fbf9f4] hover:border-[#c7a291]'
                    }`}
                  >
                    <span className="block text-sm font-bold">{item.format.split(' · ')[0]}</span>
                    <span className="mt-1 block text-xs leading-4 text-[#78827c]">{item.format.split(' · ').slice(1).join(' · ')}</span>
                  </button>
                );
              })}
            </div>
            {placement.qualification && (
              <p className="mt-3 rounded-lg border border-[#d8c6a6] bg-[#f4eddf] px-3 py-2.5 text-xs leading-5 text-[#625c4d]" data-testid="text-channel-crop-guidance">
                <strong className="font-bold">Nota sul crop.</strong> {placement.qualification}
              </p>
            )}
            {compactTerms && (
              <p className="mt-3 rounded-lg bg-[#f4eddf] px-3 py-2.5 text-xs leading-5 text-[#625c4d]">
                Per mantenere leggibili le condizioni, la grafica indica il numero di formati ammessi. L’elenco completo resta consultabile nello shop prima dell’ordine.
              </p>
            )}
            {placement.height / placement.width > 1.6 && (
              <p className="mt-3 flex gap-2 rounded-lg bg-[#e9ece4] px-3 py-2.5 text-xs leading-5 text-[#58675e]" data-testid="text-story-safe-zone">
                <Layers3 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                Testi e codice restano nell’area centrale sicura, lontano dai controlli superiori e inferiori. Le guide non vengono esportate.
              </p>
            )}
          </div>

          <div>
            <div className="mb-3">
              <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#a65c48]">03 · Direzione grafica</p>
              <h3 className="mt-1 text-base font-bold">Scegli una delle quattro proposte</h3>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {COUPON_ARTWORK_TEMPLATES.map((template, index) => (
                <button
                  key={template.id}
                  type="button"
                  data-testid={`button-template-${template.id}`}
                  aria-pressed={template.id === templateId}
                  onClick={() => setTemplateId(template.id)}
                  className={`group relative min-h-[94px] overflow-hidden rounded-xl border p-3 text-left transition-colors ${
                    template.id === templateId ? 'border-[#56736b] bg-[#e7ece6] ring-1 ring-[#56736b]/25' : 'border-[#ded8cc] bg-[#fbf9f4] hover:border-[#a9b9ae]'
                  }`}
                >
                  <span className={`mb-2 flex h-7 w-10 items-end gap-1 rounded-md p-1 ${['bg-[#d7c9b7]', 'bg-[#243c3c]', 'bg-[#f1ece1]', 'bg-[#dce6df]'][index]}`}>
                    <span className="h-3 w-2 rounded-sm bg-[#bd684f]" />
                    <span className="h-4 w-2 rounded-sm bg-[#516a62]" />
                    <span className="h-2 w-2 rounded-sm bg-[#eadfce]" />
                  </span>
                  <span className="block text-sm font-bold">{template.name}</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-[#78827c]">{template.note}</span>
                  {template.id === templateId && <Check className="absolute right-2.5 top-2.5 h-4 w-4 text-[#4c6c62]" aria-hidden="true" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-end justify-between gap-3 pb-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#a65c48]">Anteprima live</p>
              <h3 className="mt-1 text-base font-bold">Così apparirà nel canale</h3>
            </div>
            <span className="shrink-0 rounded-md bg-[#e8e3d9] px-2 py-1 font-mono text-[11px] text-[#68736e]" data-testid="text-preview-dimensions">
              {placement.width} × {placement.height}
            </span>
          </div>

          <div className="rounded-2xl border border-[#d9d2c5] bg-[#e9e5dc] p-3 sm:p-5">
            <div className="mx-auto flex min-h-[280px] max-w-[570px] items-center justify-center overflow-hidden rounded-xl bg-[#d8d2c7] p-3 sm:min-h-[410px] sm:p-5">
              <img
                src={previewUrl}
                alt={`Anteprima coupon ${coupon.code || 'stampe'} · ${COUPON_ARTWORK_TEMPLATES.find(item => item.id === templateId)?.name}`}
                data-testid="img-coupon-artwork-preview"
                className="max-h-[min(68vh,680px)] max-w-full rounded-sm object-contain shadow-[0_14px_40px_rgba(49,72,70,.18)]"
                style={{ aspectRatio: `${placement.width} / ${placement.height}`, width: 'auto', height: 'auto' }}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#6e7973]">
              <span className="inline-flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-[#a65c48]" /> {COUPON_ARTWORK_TEMPLATES.find(item => item.id === templateId)?.name}</span>
              <span>{CHANNELS.find(item => item.id === channelId)?.title}</span>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[#ded8cc] bg-[#fbf9f4] p-4" data-testid="surface-coupon-conditions">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.11em] text-[#758079]">
                <BadgeCheck className="h-4 w-4 text-[#56736b]" aria-hidden="true" /> Contenuti inclusi
              </div>
              <p className="mt-2 break-words font-mono text-sm font-bold text-[#314846]" data-testid="text-coupon-code">{coupon.code || 'Codice coupon'}</p>
              <ul className="mt-2 space-y-1 text-xs leading-5 text-[#6e7973]">
                <li data-testid="text-coupon-expiry">{coupon.endsAt ? `Scade il ${new Date(coupon.endsAt).toLocaleDateString('it-IT')}` : 'Scadenza da definire'}</li>
                <li data-testid="text-coupon-quantity">{coupon.minPrintQuantity > 0 ? `${coupon.discountType === 'fixed_total' ? 'Quantità esatta' : 'Minimo'}: ${coupon.minPrintQuantity} stampe` : 'Nessun minimo'}</li>
                <li data-testid="text-coupon-formats">{coupon.scope === 'all' ? 'Tutti i formati' : coupon.eligibleFormats.join(', ') || 'Formati selezionati'}</li>
              </ul>
            </div>
            <div className="rounded-xl border border-[#ded8cc] bg-[#fbf9f4] p-4" data-testid="surface-saved-artwork">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.11em] text-[#758079]">
                <Save className="h-4 w-4 text-[#a65c48]" aria-hidden="true" /> Immagine della promozione
              </div>
              {savedImageUrl ? (
                <div className="mt-2 flex items-center gap-3">
                  <img src={savedImageUrl} alt="Grafica attualmente salvata" className="h-14 w-14 rounded-lg border border-[#ded8cc] object-cover" data-testid="img-saved-coupon-artwork" />
                  <p className="text-xs leading-5 text-[#6e7973]">Questa grafica è già associata alla promozione. Salva la proposta selezionata per sostituirla.</p>
                </div>
              ) : (
                <p className="mt-2 text-xs leading-5 text-[#6e7973]" data-testid="text-no-saved-artwork">Nessuna immagine salvata. Scegli una proposta e salvala con la promozione.</p>
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              testId="button-download-coupon-artwork"
              variant="outline"
              disabled={disabled}
              onClick={() => void exportArtwork('download')}
            >
              {working === 'download' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
              Scarica JPEG
            </Button>
            <Button
              testId="button-save-coupon-artwork"
              disabled={disabled}
              onClick={() => void exportArtwork('save')}
            >
              {working === 'save' || (busy && !working) ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salva con la promozione
            </Button>
          </div>
          {exportError && <p className="mt-2 text-right text-sm font-medium text-red-700" role="alert" data-testid="status-artwork-error">{exportError}</p>}
          {busy && <p className="mt-2 text-right text-xs text-[#78827c]" role="status" data-testid="status-artwork-saving">Salvataggio in corso…</p>}
        </div>
      </div>
    </section>
  );
}
