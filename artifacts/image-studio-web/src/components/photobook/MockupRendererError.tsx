import { Button } from '@/components/ui/button';

interface Props {
  message: string;
  onRetry: () => void;
}

export default function MockupRendererError({ message, onRetry }: Props) {
  return (
    <section className="mockup-renderer-error" data-testid="mockup-renderer-error" role="alert">
      <span className="mockup-card-kicker">ANTEPRIMA TEMPORANEAMENTE OFFLINE</span>
      <h2>Anteprima non disponibile</h2>
      <p>{message} Le tue scelte salvate sono al sicuro.</p>
      <Button variant="outline" data-testid="button-retry-mockup-renderer" onClick={onRetry}>
        Riprova a caricare l’anteprima
      </Button>
    </section>
  );
}
