import { useState, type ReactNode } from 'react';
import { AlertTriangle, BookImage, Check, Copy, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

export function PhotobookLoadingState({ label = 'Caricamento…' }: { label?: string }) {
  return (
    <div className="photobook-ui-state" role="status" aria-live="polite">
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function PhotobookErrorState({
  title = 'Non è stato possibile caricare i dati',
  message,
  onRetry,
  retryLabel = 'Riprova',
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <Card className="photobook-ui-error border-destructive/30 bg-destructive/5" role="alert">
      <CardContent className="space-y-3 py-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-destructive" aria-hidden="true" />
        <div>
          <h2 className="font-semibold">{title}</h2>
          {message && <p className="mt-1 text-sm text-muted-foreground">{message}</p>}
        </div>
        {onRetry && (
          <Button variant="outline" onClick={onRetry} className="min-h-11">
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            {retryLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function PhotobookEmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="photobook-ui-empty">
      <CardContent className="space-y-3 py-10 text-center">
        <BookImage className="mx-auto h-9 w-9 text-muted-foreground/60" aria-hidden="true" />
        <div>
          <h2 className="font-semibold">{title}</h2>
          {message && <p className="mt-1 text-sm text-muted-foreground">{message}</p>}
        </div>
        {action}
      </CardContent>
    </Card>
  );
}

export function CopyFeedbackButton({
  text,
  label = 'Copia',
  testId,
}: {
  text: string;
  label?: string;
  testId?: string;
}) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="min-h-10 gap-1.5"
      aria-label={`${label}: ${text}`}
      data-testid={testId}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          toast({
            title: 'Copia non riuscita',
            description: 'Seleziona e copia il testo manualmente.',
            variant: 'destructive',
          });
        }
      }}
    >
      {copied ? <Check className="h-4 w-4 text-green-600" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      <span>{copied ? 'Copiato' : label}</span>
    </Button>
  );
}