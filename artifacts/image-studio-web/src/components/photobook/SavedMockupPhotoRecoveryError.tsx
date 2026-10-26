import { Button } from '@/components/ui/button';
import type { SavedMockupPhotoFailure } from './mockup-photo-recovery';

interface Props {
  failure: SavedMockupPhotoFailure;
  retryBusy: boolean;
  onRetry: () => void;
  studioRepair?: {
    slotLabel: string;
    disabled: boolean;
    onChooseFromGallery: () => void;
    onUpload: () => void;
  };
}

export default function SavedMockupPhotoRecoveryError({ failure, retryBusy, onRetry, studioRepair }: Props) {
  return (
    <section className="mockup-photo-recovery-error" role="alert" data-testid="mockup-saved-photo-error">
      {studioRepair && failure.kind === 'unavailable' ? (
        <>
          <p>
            La foto {studioRepair.slotLabel} non è più disponibile. Sostituiscila dalla galleria o caricane una nuova:
            le altre scelte del mockup resteranno invariate.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={studioRepair.disabled} onClick={studioRepair.onChooseFromGallery}>
              Scegli dalla galleria
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={studioRepair.disabled} onClick={studioRepair.onUpload}>
              Carica una foto
            </Button>
          </div>
        </>
      ) : <p>{failure.message}</p>}
      {failure.kind === 'temporary' && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="button-retry-mockup-saved-photo"
          disabled={retryBusy}
          onClick={onRetry}
        >
          {retryBusy ? 'Caricamento…' : 'Riprova a caricare la foto'}
        </Button>
      )}
    </section>
  );
}
