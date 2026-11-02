import type { ResolvedSocialImage } from '@shared/social-metadata';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface SocialCardPreviewProps {
  image: ResolvedSocialImage;
  title: string;
  description: string;
  url: string;
  testId: string;
}

const IMAGE_SOURCE_LABELS: Record<ResolvedSocialImage['source'], string> = {
  'editorial-cover': 'Copertina articolo',
  'content-image': 'Immagine nel contenuto',
  'selected-photo': 'Foto selezionata',
  'curated-static': 'Immagine del sito',
  'section-fallback': 'Immagine predefinita della sezione',
  'global-fallback': 'Immagine predefinita del sito',
};

export default function SocialCardPreview({
  image,
  title,
  description,
  url,
  testId,
}: SocialCardPreviewProps) {
  return (
    <Card data-testid={testId}>
      <CardHeader>
        <CardTitle className="text-lg">Anteprima scheda social</CardTitle>
        <CardDescription>
          L’immagine e il testo alternativo sono quelli risolti dai metadati pubblici.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="mx-auto max-w-[480px] overflow-hidden rounded-lg border bg-white">
          <img
            src={image.url}
            alt={image.alt}
            className="aspect-[1.91/1] w-full bg-stone-100 object-cover"
            data-testid={`${testId}-image`}
          />
          <div className="space-y-1 p-3">
            <p className="truncate text-xs uppercase tracking-wide text-gray-500">
              {url}
            </p>
            <p className="line-clamp-2 font-semibold text-gray-900" data-testid={`${testId}-title`}>
              {title || 'Titolo dell’articolo'}
            </p>
            <p className="line-clamp-2 text-sm text-gray-600">
              {description || 'La descrizione social apparirà qui.'}
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-[480px] space-y-1 text-sm">
          <p data-testid={`${testId}-alt`}>
            <span className="font-medium">Testo alternativo:</span> {image.alt}
          </p>
          <p className="text-xs text-muted-foreground">
            Immagine risolta: {IMAGE_SOURCE_LABELS[image.source]}
          </p>
          {image.source === 'section-fallback' && (
            <p
              role="alert"
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900"
              data-testid={`${testId}-fallback-warning`}
            >
              Non è disponibile un’immagine valida per questo contenuto: verrà usata l’immagine
              predefinita della sezione.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
