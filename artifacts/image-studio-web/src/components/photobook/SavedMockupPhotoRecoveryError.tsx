import { Button } from '@/components/ui/button';
import type { SavedMockupPhotoFailure } from './mockup-photo-recovery';

interface Props {
  failure: SavedMockupPhotoFailure;
  retryBusy: boolean;
  onRetry: () => void;
}

export default function SavedMockupPhotoRecoveryError({ failure, retryBusy, onRetry }: Props) {
  return (
    <section className="mockup-photo-recovery-error" role="alert" data-testid="mockup-saved-photo-error">
      <p>{failure.message}</p>
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
