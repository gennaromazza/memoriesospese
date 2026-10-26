import { useEffect } from 'react';
import { useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { getPhotobookByToken } from '@/lib/photobooks';
import PhotobookMockup from '@/components/photobook/PhotobookMockup';
import { PhotobookLoadingState, PhotobookErrorState } from '@/components/photobook/PhotobookUiStates';
import { BookOpenCheck, LockKeyhole, MessageCircleMore } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
              {state.data && <span className="rounded-full border border-[#e5ded1] bg-[#f7f3eb] px-3 py-1.5 text-[11px] font-medium tracking-wide text-[#806c51]">Revisione {state.data.version}</span>}
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
            : state.data && (state.data.photobook.approval?.version !== state.data.version
              ? <section role="status" data-testid="status-mockup-not-ready" className="rounded-[1.4rem] border border-[#e6ddc9] bg-[#fbf8f0] px-5 py-7 shadow-[0_16px_45px_-38px_rgba(88,70,43,0.35)] sm:px-8 sm:py-9">
                  <div className="mx-auto max-w-xl text-center">
                    <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-[#eee6d5] text-[#8c744f]"><BookOpenCheck className="h-5 w-5" aria-hidden="true" /></div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8c744f]">Anteprima in preparazione</p>
                    <h2 className="mt-2 font-playfair text-2xl text-[#354d47] sm:text-[1.8rem]">Stiamo aspettando la revisione definitiva</h2>
                    <p className="mt-3 text-sm leading-6 text-[#68756c]">Per aprire l’anteprima, approvate prima le pagine di questa versione dalla pagina del fotolibro. Dopo l’approvazione, questo link continuerà ad aprire la stessa anteprima.</p>
                    <Button asChild className="mt-5 min-h-11 rounded-xl bg-[#45675b] px-5 text-[#fbfcf8] hover:bg-[#36584c]" data-testid="button-open-photobook-pages">
                      <Link href={`/fotolibro/${encodeURIComponent(token)}`}>
                        <MessageCircleMore className="mr-2 h-4 w-4" aria-hidden="true" />
                        Apri le pagine del fotolibro
                      </Link>
                    </Button>
                  </div>
                </section>
              : <div className="animate-in fade-in duration-500">
                  <PhotobookMockup key={`${state.data.photobook.id}-${state.data.version}`} photobookId={state.data.photobook.id} version={state.data.version} token={token} readOnly autoOpen confirmedOnly />
                </div>)}
        <footer className="flex flex-col gap-2 border-t border-[#dce4dc] px-1 pt-4 text-xs leading-5 text-[#728079] sm:flex-row sm:items-center sm:justify-between">
          <span>Un link privato, da condividere solo con chi desiderate.</span>
          <span>Visualizzare o confermare il mockup non avvia la stampa.</span>
        </footer>
      </div>
    </main>
  );
}
