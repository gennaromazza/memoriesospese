import { useQuery } from '@tanstack/react-query';
import { auth } from '@/lib/firebase';
import { createUrl } from '@/lib/config';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { MockupPayload } from '@shared/mockup-types';
import { MOCKUP_STATUS_LABELS, type MockupOption } from '@shared/mockup-workflow';
import { CopyFeedbackButton } from './PhotobookUiStates';

export type MockupPathChoice = 'client' | 'studio';
export type MockupAdminTab = 'review' | 'edit' | 'offer';
/** Il configuratore 3D ascolta questo evento e si apre direttamente sulla scheda richiesta. */
export const OPEN_MOCKUP_EVENT = 'photobook-mockup-open';
export const openMockupTab = (photobookId: string, tab: MockupAdminTab) =>
  window.dispatchEvent(new CustomEvent(OPEN_MOCKUP_EVENT, { detail: { photobookId, tab } }));

interface Props {
  photobookId: string;
  version: number;
  currentVersion: number;
  pagesApproved: boolean;
  mockupPath: MockupPathChoice;
  pathBusy: boolean;
  onPathChange: (path: MockupPathChoice) => void;
  /** Stato leggibile dell'email al cliente, già tradotto dalla pagina. */
  emailStatus: string;
  emailNote?: string;
  emailActions?: React.ReactNode;
  readOnly: boolean;
  clientLink?: string;
  onSelectVersion?: (version: number) => void;
}

export async function fetchMockupState(photobookId: string, version: number): Promise<MockupPayload> {
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error('Accedi nuovamente per proseguire');
  const token = await auth.currentUser.getIdToken();
  const response = await fetch(createUrl(`/api/photobooks/${encodeURIComponent(photobookId)}/mockup?version=${version}`), { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error('Impossibile leggere lo stato del mockup');
  return response.json();
}

function describeOption(o: MockupOption): string {
  if (!o.setup) return `${o.labName} · ${o.name}`;
  const size = `${o.labName} · ${o.name} · ${o.setup.format.w}×${o.setup.format.h} cm`;
  if (!('cover' in o.setup)) return size;
  const cover = { choice: 'copertina a scelta del cliente', photo: 'copertina con foto del cliente', graphic: 'copertina con la tua grafica' }[o.setup.cover.mode];
  return `${size} · ${cover}`;
}

function Step({ n, title, done, active, children }: { n: number; title: string; done?: boolean; active?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-3" aria-current={active ? 'step' : undefined} data-current-step={active ? 'true' : undefined}>
      <span aria-hidden className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${done ? 'bg-emerald-600 text-white' : active ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>{done ? '✓' : n}</span>
      <div className="min-w-0 flex-1 space-y-2">
        <h3 className={`font-medium leading-7 ${active ? 'text-primary' : ''}`}>{title}{active && <span className="ml-2 text-xs font-normal text-muted-foreground">Passo attuale</span>}</h3>
        {children}
      </div>
    </li>
  );
}

/** Stato delle pagine e gestione indipendente del mockup dell'album. */
export default function MockupAdminFlow({ photobookId, version, currentVersion, pagesApproved, mockupPath, pathBusy, onPathChange, emailStatus, emailNote, emailActions, readOnly, clientLink, onSelectVersion }: Props) {
  const state = useQuery<MockupPayload>({
    queryKey: ['photobook-mockup-flow', photobookId, version],
    queryFn: () => fetchMockupState(photobookId, version),
    refetchOnWindowFocus: true,
    refetchInterval: query => query.state.data?.saved?.status === 'confirmed'
      && query.state.data.saved.clientApproval?.revision !== query.state.data.saved.revision ? 30_000 : false,
  });
  const offer = state.data?.offer;
  const saved = state.data?.saved;
  const assigned = !!offer?.options.length;
  const studio = mockupPath === 'studio';
  const currentStep = !state.data
    ? 0
    : !assigned
      ? 1
      : studio
        ? !saved || saved.status !== 'confirmed'
          ? saved ? 3 : 2
          : 3
        : !pagesApproved ? 2 : 3;
  const nextAction = state.isError
    ? 'Stato non disponibile: riprova a caricare la scheda.'
    : state.isLoading && !state.data
      ? 'Caricamento dello stato del mockup…'
      : !assigned
        ? 'Assegna il modello o le opzioni che il cliente potrà scegliere.'
        : studio && !saved
          ? 'Prepara la bozza: seleziona le foto della galleria o carica quelle necessarie.'
          : studio && saved?.status !== 'confirmed'
            ? 'Verifica la bozza salvata e conferma il mockup.'
          : studio && saved?.status === 'confirmed'
            ? 'Mockup confermato: controlla l’email o copia il link per condividerlo.'
            : !pagesApproved
              ? 'Il cliente potrà scegliere e personalizzare il modello dopo l’approvazione delle pagine.'
              : !saved
                ? 'Il cliente può scegliere dal link del fotolibro; controlla lo stato dell’email.'
                : saved.status === 'submitted'
                  ? 'Verifica la proposta inviata dal cliente.'
                  : saved.status === 'changes_requested'
                    ? 'Il cliente deve aggiornare la proposta e inviarla di nuovo.'
                    : 'Mockup confermato. Controlla l’email o copia il link di anteprima.';
  return (
    <Card data-testid="mockup-admin-flow"><CardContent className="pt-4 space-y-4">
      <div>
        <h2 className="font-semibold">Mockup dell’album</h2>
        <p className="text-sm text-muted-foreground">Prima assegna il modello; poi prepara la bozza scegliendo o caricando le immagini necessarie. Gli asset richiesti dal prodotto sono indicati nell’assegnazione.</p>
        <p className="mt-2 rounded-md bg-muted/60 px-3 py-2 text-sm" role="status" data-testid="mockup-next-action"><strong>Prossima azione:</strong> {nextAction}</p>
      </div>
      <div className="rounded-md border px-3 py-2 text-sm" role="status" data-testid="photobook-page-approval-status">
        <strong>Impaginato:</strong> {pagesApproved ? `versione ${currentVersion} approvata dal cliente` : `versione ${currentVersion} non ancora approvata`}. Questo stato è separato dal mockup.
      </div>
      {readOnly && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="mockup-flow-readonly">
          {version !== currentVersion
            ? <>Stai guardando la v{version}, che non è la versione corrente (v{currentVersion}). Il mockup si imposta sulla v{currentVersion}.{onSelectVersion && <Button type="button" size="sm" variant="outline" className="ml-2 min-h-9" onClick={() => onSelectVersion(currentVersion)}>Passa alla v{currentVersion}</Button>}</>
            : 'Il fotolibro è bloccato (inviato in stampa): il mockup non si può più modificare.'}
        </p>
      )}
      <ol className="space-y-5">
        <Step n={1} title="Modello assegnato" done={assigned} active={currentStep === 1}>
          {state.isLoading && <p className="text-sm text-muted-foreground">Caricamento…</p>}
          {state.isError && <p role="alert" className="text-sm text-destructive">Stato del mockup non leggibile.</p>}
          {state.data && (assigned
            ? <ul className="text-sm space-y-1">{offer!.options.map(o => <li key={`${o.labId}/${o.id}`}>{describeOption(o)}</li>)}</ul>
            : <p className="text-sm">Nessun modello assegnato. Scegli uno o più album, anche con formato e copertina per la scatola.</p>)}
          <div className="flex flex-wrap gap-2">
            <Button variant={assigned ? 'outline' : 'default'} className="min-h-11" disabled={readOnly} onClick={() => openMockupTab(photobookId, 'offer')}>{assigned ? 'Cambia modello' : 'Assegna modello'}</Button>
          </div>
        </Step>
        <Step n={2} title="Percorso del mockup" done active={currentStep === 2}>
          <fieldset className="space-y-2" disabled={pathBusy || readOnly}>
            <legend className="sr-only">Chi prepara la bozza</legend>
            <label className="flex items-start gap-2 text-sm"><input type="radio" name="mockup-path" className="mt-1" checked={studio} onChange={() => onPathChange('studio')} /><span><strong>Io preparo e confermo</strong><small className="block text-muted-foreground">Puoi preparare e condividere il mockup indipendentemente dall’approvazione delle pagine.</small></span></label>
            <label className="flex items-start gap-2 text-sm"><input type="radio" name="mockup-path" className="mt-1" checked={!studio} onChange={() => onPathChange('client')} /><span><strong>Il cliente sceglie tra i modelli assegnati</strong><small className="block text-muted-foreground">Il cliente riceve il link e personalizza dopo aver approvato le pagine.</small></span></label>
          </fieldset>
          {studio
            ? <><p className="text-sm text-muted-foreground">Le foto della bozza si scelgono dalla galleria o si caricano nel passaggio successivo, non qui.</p><Button className="min-h-11" disabled={readOnly || !assigned} onClick={() => openMockupTab(photobookId, 'edit')}>{saved ? 'Modifica la bozza' : 'Prepara la bozza'}</Button></>
            : <p className="text-sm text-muted-foreground">In questo percorso la bozza viene composta dal cliente dopo l’approvazione delle pagine.</p>}
        </Step>
        <Step n={3} title={studio ? 'Verifica e condivisione' : 'Stato della scelta cliente'} done={saved?.status === 'confirmed'} active={currentStep === 3}>
          <p className="text-sm">{saved ? `Bozza: ${MOCKUP_STATUS_LABELS[saved.status || 'draft']} · revisione ${saved.revision}` : 'Nessuna bozza ancora.'}</p>
          {saved?.status === 'confirmed' && <p className="text-sm" data-testid="mockup-client-approval-status">{saved.clientApproval?.revision === saved.revision ? `Mockup approvato dal cliente il ${new Date(saved.clientApproval.approvedAt).toLocaleString('it-IT')}` : 'Il riscontro del cliente sul mockup è facoltativo e distinto dall’approvazione delle pagine.'}</p>}
          <p className="text-sm">Email: {emailStatus}</p>
          {emailNote && <p className="text-sm text-amber-700">{emailNote}</p>}
          <div className="flex flex-wrap gap-2">
            {studio && saved && saved.status !== 'confirmed' && <Button variant="outline" className="min-h-11" disabled={readOnly} onClick={() => openMockupTab(photobookId, 'review')}>Verifica e conferma</Button>}
            {emailActions}
            {clientLink && saved?.status === 'confirmed' && version === currentVersion && (
              <CopyFeedbackButton text={`${clientLink}/mockup?version=${version}`} label="Copia link mockup" testId="button-copy-mockup-link" />
            )}
          </div>
          {clientLink && <p className="text-xs text-muted-foreground">Dopo aver salvato e confermato il mockup puoi copiare il link e inviarlo su WhatsApp o via email. Il cliente visualizza la revisione indicata nell’anteprima senza modificarla; il riscontro è facoltativo. La stampa non parte automaticamente.</p>}
        </Step>
      </ol>
    </CardContent></Card>
  );
}

/** Riga di stato per la lista fotolibri: dice a che punto è il mockup senza aprirlo. */
export function MockupStatusLine({ photobookId, version }: { photobookId: string; version: number }) {
  const state = useQuery<MockupPayload>({ queryKey: ['photobook-mockup-flow', photobookId, version], queryFn: () => fetchMockupState(photobookId, version), refetchOnWindowFocus: false, staleTime: 60_000 });
  if (!state.data) return null;
  const saved = state.data.saved;
  const text = !state.data.offer?.options.length ? 'nessun modello assegnato'
    : !saved ? `${state.data.offer.options.length === 1 ? state.data.offer.options[0].name : `${state.data.offer.options.length} modelli`} · bozza da preparare`
    : MOCKUP_STATUS_LABELS[saved.status || 'draft'].toLowerCase();
  return <p className="text-xs text-muted-foreground" data-testid={`mockup-status-${photobookId}`}>Mockup: {text}</p>;
}
