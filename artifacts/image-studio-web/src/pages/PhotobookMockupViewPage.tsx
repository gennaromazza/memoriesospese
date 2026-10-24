import { useEffect } from 'react';
import { useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { getPhotobookByToken } from '@/lib/photobooks';
import PhotobookMockup from '@/components/photobook/PhotobookMockup';
import { PhotobookLoadingState, PhotobookErrorState } from '@/components/photobook/PhotobookUiStates';

/** Uses the existing private client token, without exposing admin tools or changing approval. */
export default function PhotobookMockupViewPage() {
  const { token = '' } = useParams<{ token: string }>();
  const rawVersion = new URLSearchParams(window.location.search).get('version');
  const version = rawVersion ? Number(rawVersion) : undefined;
  const validVersion = version === undefined || (Number.isInteger(version) && version > 0 && version <= 9999);
  const state = useQuery({
    queryKey: ['/api/photobooks/by-token', token, version ?? null],
    queryFn: () => getPhotobookByToken(token, version),
    enabled: !!token && validVersion,
    staleTime: 0,
  });

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Anteprima mockup fotolibro';
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow, noarchive';
    document.head.append(robots);
    return () => { document.title = previousTitle; robots.remove(); };
  }, []);

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-3xl space-y-5">
        <header>
          <h1 className="text-2xl font-semibold text-stone-900">Il tuo mockup{state.data ? ` · ${state.data.photobook.name}` : ''}</h1>
          <p className="mt-2 text-sm text-stone-600">Scopri l’anteprima dell’album preparata dallo studio. Questa visualizzazione non modifica le tue scelte e non avvia la stampa.</p>
        </header>
        {!validVersion || state.isError
          ? <PhotobookErrorState title="Link mockup non disponibile" message="Il link non è valido, è scaduto o la versione non è disponibile. Contatta lo studio." onRetry={validVersion ? () => void state.refetch() : undefined} />
          : state.isLoading
            ? <PhotobookLoadingState label="Caricamento del tuo mockup…" />
            : state.data && (state.data.photobook.approval?.version !== state.data.version
              ? <p role="status" className="rounded-lg border bg-white p-4 text-sm">Le pagine di questa versione non sono ancora approvate. Contatta lo studio per l’anteprima definitiva.</p>
              : <PhotobookMockup key={`${state.data.photobook.id}-${state.data.version}`} photobookId={state.data.photobook.id} version={state.data.version} token={token} readOnly autoOpen confirmedOnly />)}
        <p className="text-xs text-stone-500">Link riservato: condividilo solo con le persone a cui vuoi mostrare il fotolibro. Per richiedere modifiche, contatta lo studio.</p>
      </div>
    </main>
  );
}
