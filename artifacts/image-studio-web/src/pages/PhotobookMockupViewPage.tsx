import { useEffect } from 'react';
import { useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { getPhotobookByToken } from '@/lib/photobooks';
import PhotobookMockup from '@/components/photobook/PhotobookMockup';
import { PhotobookLoadingState, PhotobookErrorState } from '@/components/photobook/PhotobookUiStates';
import { BookOpenCheck, LockKeyhole } from 'lucide-react';

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
    <main className="min-h-[100dvh] bg-[#f1f4ef] px-4 py-7 text-[#334b48] sm:px-6 sm:py-12">
      <div className="mx-auto max-w-5xl space-y-7">
        <header className="relative overflow-hidden rounded-[1.6rem] border border-[#d8e1d9] bg-[#fbfcf8] px-5 py-7 shadow-[0_18px_55px_-42px_rgba(39,68,61,0.55)] sm:px-9 sm:py-9">
          <div aria-hidden="true" className="absolute -right-12 -top-16 h-56 w-56 rounded-full border-[1px] border-[#e7d8c3] sm:h-72 sm:w-72" />
          <div aria-hidden="true" className="absolute -right-2 -top-8 h-40 w-40 rounded-full border-[1px] border-[#e7d8c3] sm:h-52 sm:w-52" />
          <div className="relative max-w-3xl">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-[#e8efe8] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4b6b61]">
                <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
                Link riservato dello studio
              </span>
              {state.data && <span className="rounded-full border border-[#e5ded1] bg-[#f7f3eb] px-3 py-1.5 text-[11px] font-medium tracking-wide text-[#806c51]">Versione fotolibro v{state.data.version}</span>}
            </div>
            <h1 className="font-playfair text-[2rem] font-medium leading-[1.12] tracking-[-0.025em] text-[#294541] sm:text-[2.8rem]">
              La vostra anteprima{state.data ? <><span className="hidden sm:inline"> · </span><span className="block text-[#668174] sm:inline">{state.data.photobook.name}</span></> : ''}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[#647570] sm:text-base sm:leading-7">
              Lo studio ha preparato questo album per voi. Sfogliate il mockup in sola lettura; la conferma è una risposta separata e non avvia la stampa.
            </p>
            <div className="mt-6 flex items-start gap-3 border-t border-[#e7ece6] pt-5 text-sm leading-6 text-[#65756f]">
              <BookOpenCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#a27b50]" aria-hidden="true" />
              <span>Per chiedere una modifica, scrivete allo studio prima di confermare.</span>
            </div>
          </div>
        </header>
        {!validVersion || state.isError
          ? <div className="rounded-[1.4rem] border border-[#ead7cd] bg-[#fffaf7] p-2 shadow-[0_16px_45px_-38px_rgba(88,52,38,0.42)]">
              <PhotobookErrorState title="Link mockup non disponibile" message="Il link potrebbe essere scaduto oppure questa revisione non è disponibile. Contattate lo studio per ricevere un link aggiornato." retryLabel="Ricarica anteprima" onRetry={validVersion ? () => void state.refetch() : undefined} />
            </div>
          : state.isLoading
            ? <div className="rounded-[1.4rem] border border-[#dce5dc] bg-[#fbfcf8] p-2 shadow-[0_16px_45px_-38px_rgba(39,68,61,0.45)]">
                <PhotobookLoadingState label="Stiamo aprendo la vostra anteprima…" />
              </div>
            : state.data
              ? <div className="space-y-4 animate-in fade-in duration-500">
                  <p className="rounded-xl border border-[#dce5dc] bg-[#fbfcf8] px-4 py-3 text-sm leading-6 text-[#65756f]" role="status" data-testid="status-photobook-approval">
                    {state.data.photobook.approval?.version === state.data.version
                      ? `L’impaginato della versione ${state.data.version} è approvato. Questo link mostra separatamente il mockup preparato dallo studio.`
                      : `L’impaginato della versione ${state.data.version} non è ancora approvato. Potete comunque consultare il mockup confermato dello studio; il riscontro sul mockup è facoltativo.`}
                  </p>
                  <PhotobookMockup key={`${state.data.photobook.id}-${state.data.version}`} photobookId={state.data.photobook.id} version={state.data.version} token={token} readOnly autoOpen confirmedOnly />
                </div>
              : null}
        <footer className="flex flex-col gap-2 border-t border-[#dce4dc] px-1 pt-4 text-xs leading-5 text-[#728079] sm:flex-row sm:items-center sm:justify-between">
          <span>Un link privato, da condividere solo con chi desiderate.</span>
          <span>Visualizzare o confermare il mockup non avvia la stampa.</span>
        </footer>
      </div>
    </main>
  );
}
