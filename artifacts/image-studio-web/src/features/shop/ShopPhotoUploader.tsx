import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Camera, CheckCircle2, ImageIcon, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { SHOP_MAX_PHOTO_BYTES, type ShopAssetDto, type ShopOrderDto } from '@shared/shop-types';
import { Button } from '@/components/ui/button';
import { shopApi } from './shop-api';
import { uploadShopPhoto, validateShopPhotoFile } from './shop-upload';

type OrderLine = ShopOrderDto['lines'][number];

interface QueueItem {
  id: number;
  name: string;
  progress: number;
  error?: string;
}

/** Anteprima ridotta di una foto già caricata: serve l'accesso, quindi si scarica come file. */
function PhotoThumb({ orderId, asset }: { orderId: string; asset: ShopAssetDto }) {
  const preview = useQuery({
    queryKey: ['shop-asset-preview', orderId, asset.id],
    queryFn: () => shopApi.assetPreview(orderId, asset.id),
    enabled: asset.status === 'ready',
    staleTime: Infinity,
    retry: false,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!preview.data) return;
    const objectUrl = URL.createObjectURL(preview.data);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [preview.data]);
  return url ? (
    <img src={url} alt={asset.originalName} className="h-20 w-20 rounded-xl object-cover" />
  ) : (
    <span className="flex h-20 w-20 items-center justify-center rounded-xl bg-sage/10 text-blue-gray/40" aria-label={asset.originalName}>
      {asset.status === 'ready' && preview.isLoading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <ImageIcon className="h-6 w-6" aria-hidden="true" />}
    </span>
  );
}

/**
 * Foto richieste da una riga dell'ordine: elenco di quelle caricate, aggiunta
 * di nuove (una dopo l'altra) e rimozione. Il file va direttamente su storage;
 * il server poi lo controlla.
 */
export function ShopPhotoUploader({
  orderId,
  line,
  disabled,
  onChanged,
}: {
  orderId: string;
  line: OrderLine;
  disabled?: boolean;
  onChanged: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busyAsset, setBusyAsset] = useState<string | null>(null);
  const ready = line.photos.filter(photo => photo.status === 'ready');
  const unfinished = line.photos.filter(photo => photo.status === 'prepared');
  const remaining = Math.max(0, line.photosRequired - line.photos.length - queue.filter(item => !item.error).length);
  const uploading = queue.some(item => !item.error);

  const patchQueue = (id: number, patch: Partial<QueueItem>) => setQueue(items => items.map(item => (item.id === id ? { ...item, ...patch } : item)));

  const uploadOne = async (file: File, id: number) => {
    const reason = validateShopPhotoFile(file, SHOP_MAX_PHOTO_BYTES);
    if (reason) {
      patchQueue(id, { error: reason });
      return;
    }
    try {
      const prepared = await shopApi.prepareUpload(orderId, line.lineId, { fileName: file.name, contentType: 'image/jpeg', sizeBytes: file.size });
      await uploadShopPhoto({ file, uploadUrl: prepared.uploadUrl, onProgress: progress => patchQueue(id, { progress }) });
      await shopApi.finalizeUpload(orderId, prepared.assetId);
      setQueue(items => items.filter(item => item.id !== id));
      onChanged();
    } catch (error) {
      patchQueue(id, { error: error instanceof Error ? error.message : 'Il caricamento non è riuscito.' });
      onChanged();
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setMessage(null);
    const chosen = Array.from(files);
    if (chosen.length > remaining) setMessage(`Servono ${remaining === 1 ? 'solo 1 foto' : `solo ${remaining} foto`}: le altre sono state ignorate.`);
    const accepted = chosen.slice(0, remaining);
    const items = accepted.map((file, index) => ({ id: Date.now() + index, name: file.name, progress: 0 }));
    setQueue(current => [...current.filter(item => item.error), ...items]);
    for (let index = 0; index < accepted.length; index++) await uploadOne(accepted[index], items[index].id);
    if (input.current) input.current.value = '';
  };

  const remove = async (asset: ShopAssetDto) => {
    setBusyAsset(asset.id);
    setMessage(null);
    try {
      await shopApi.removeAsset(orderId, asset.id);
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Non riesco a eliminare la foto.');
    } finally {
      setBusyAsset(null);
    }
  };

  const verify = async (asset: ShopAssetDto) => {
    setBusyAsset(asset.id);
    setMessage(null);
    try {
      await shopApi.finalizeUpload(orderId, asset.id);
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'La foto non risulta caricata: eliminala e riprova.');
    } finally {
      setBusyAsset(null);
    }
  };

  return (
    <div className="rounded-2xl border border-sage/20 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">{line.productName}</p>
          <p className="text-xs text-blue-gray/55">
            {ready.length} di {line.photosRequired} {line.photosRequired === 1 ? 'foto caricata' : 'foto caricate'}
          </p>
        </div>
        {ready.length >= line.photosRequired ? (
          <span className="flex items-center gap-1 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Complete</span>
        ) : null}
      </div>

      {line.photos.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-3">
          {line.photos.map(photo => (
            <li key={photo.id} className="relative">
              <PhotoThumb orderId={orderId} asset={photo} />
              {photo.lowResolution && (
                <span className="absolute inset-x-0 bottom-0 rounded-b-xl bg-amber-500/90 px-1 py-0.5 text-center text-[10px] font-semibold text-white" title="Foto piccola: potrebbe venire sfocata">
                  Piccola
                </span>
              )}
              {!disabled && (
                <div className="mt-1 flex justify-center gap-1">
                  {photo.status === 'prepared' && (
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={busyAsset === photo.id} onClick={() => void verify(photo)} aria-label="Verifica il caricamento">
                      <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-red-700" disabled={busyAsset === photo.id} onClick={() => void remove(photo)} aria-label={`Elimina ${photo.originalName}`}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {unfinished.length > 0 && <p className="mt-2 text-xs text-amber-700">Una foto non è stata completata: premi l'icona di verifica o eliminala e riprova.</p>}
      {ready.some(photo => photo.lowResolution) && <p className="mt-2 text-xs text-amber-700">Alcune foto sono piccole: il prodotto potrebbe venire sfocato. Se puoi, carica l'originale.</p>}

      {queue.length > 0 && (
        <ul className="mt-3 space-y-2" aria-live="polite">
          {queue.map(item => (
            <li key={item.id} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{item.name}</span>
                {item.error ? (
                  <button type="button" className="text-red-700 underline" onClick={() => setQueue(items => items.filter(entry => entry.id !== item.id))}>Chiudi</button>
                ) : (
                  <span>{item.progress}%</span>
                )}
              </div>
              {item.error ? (
                <p className="mt-1 flex items-start gap-1 text-red-700" role="alert"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" aria-hidden="true" /> {item.error}</p>
              ) : (
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sage/20"><div className="h-full bg-terracotta transition-all" style={{ width: `${item.progress}%` }} /></div>
              )}
            </li>
          ))}
        </ul>
      )}

      {message && <p className="mt-3 text-sm text-red-700" role="alert">{message}</p>}

      {!disabled && remaining > 0 && (
        <div className="mt-4">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,.jpg,.jpeg"
            multiple={remaining > 1}
            className="sr-only"
            id={`photo-${line.lineId}`}
            onChange={event => void handleFiles(event.target.files)}
            disabled={uploading}
          />
          <Button type="button" variant="outline" className="rounded-full" disabled={uploading} onClick={() => input.current?.click()}>
            {uploading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Camera aria-hidden="true" />}
            {line.photos.length === 0 ? 'Scegli la foto' : 'Aggiungi foto'}{remaining > 1 ? ` (ne mancano ${remaining})` : ''}
          </Button>
          <p className="mt-2 text-xs text-blue-gray/50">Solo file JPG, fino a {Math.floor(SHOP_MAX_PHOTO_BYTES / (1024 * 1024))} MB. Le foto sono private: le vediamo solo noi.</p>
        </div>
      )}
    </div>
  );
}
