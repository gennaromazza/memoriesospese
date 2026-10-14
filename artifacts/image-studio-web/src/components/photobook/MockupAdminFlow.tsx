import { useQuery } from '@tanstack/react-query';
import { auth } from '@/lib/firebase';
import { createUrl } from '@/lib/config';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { MockupPayload } from '@shared/mockup-types';
import { MOCKUP_STATUS_LABELS, type MockupOption } from '@shared/mockup-workflow';

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
}

async function fetchState(photobookId: string, version: number): Promise<MockupPayload> {
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error('Accedi nuovamente per proseguire');
  const token = await auth.currentUser.getIdToken();
  const response = await fetch(createUrl(`/api/photobooks/${encodeURIComponent(photobookId)}/mockup?version=${version}`), { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error('Impossibile leggere lo stato del mockup');
  return response.json();
}

function describeOption(o: MockupOption): string {
  if (!o.setup) return `${o.labName} · ${o.name}`;
  const cover = { choice: 'copertina a scelta del cliente', photo: 'copertina con foto del cliente', graphic: 'copertina con la tua grafica' }[o.setup.cover.mode];
  return `${o.labName} · ${o.name} · ${o.setup.format.w}×${o.setup.format.h} cm · ${cover}`;
}

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${done ? 'bg-emerald-600 text-white' : 'bg-muted text-foreground'}`}>{done ? '✓' : n}</span>
      <div className="min-w-0 flex-1 space-y-2">
        <h3 className="font-medium leading-7">{title}</h3>
        {children}
      </div>
    </li>
  );
}

/** Gestione dell'album in 4 passi: pagine, modello, chi prepara la bozza, stato e invio. */
export default function MockupAdminFlow({ photobookId, version, currentVersion, pagesApproved, mockupPath, pathBusy, onPathChange, emailStatus, emailNote, emailActions, readOnly }: Props) {
  const state = useQuery<MockupPayload>({ queryKey: ['photobook-mockup-flow', photobookId, version], queryFn: () => fetchState(photobookId, version), refetchOnWindowFocus: false });
  const offer = state.data?.offer;
  const saved = state.data?.saved;
  const assigned = !!offer?.options.length;
  const studio = mockupPath === 'studio';
  return (
    <Card data-testid="mockup-admin-flow"><CardContent className="pt-4 space-y-4">
      <div>
        <h2 className="font-semibold">Mockup dell’album</h2>
        <p className="text-sm text-muted-foreground">Quattro passi, in ordine. Le foto arrivano sempre dalla galleria collegata a questo fotolibro.</p>
      </div>
      <ol className="space-y-5">
        <Step n={1} title="Pagine approvate dal cliente" done={pagesApproved}>
          <p className="text-sm">{pagesApproved ? `Il cliente ha approvato la versione ${currentVersion}.` : `In attesa che il cliente approvi la versione ${currentVersion}. Il mockup si apre al cliente solo dopo.`}</p>
        </Step>
        <Step n={2} title="Modello assegnato" done={assigned}>
          {state.isLoading && <p className="text-sm text-muted-foreground">Caricamento…</p>}
          {state.isError && <p role="alert" className="text-sm text-destructive">Stato del mockup non leggibile.</p>}
          {state.data && (assigned
            ? <ul className="text-sm space-y-1">{offer!.options.map(o => <li key={`${o.labId}/${o.id}`}>{describeOption(o)}</li>)}</ul>
            : <p className="text-sm">Nessun modello assegnato. Scegli uno o più album, anche con formato e copertina per la scatola.</p>)}
          <Button variant="outline" className="min-h-11" disabled={readOnly} onClick={() => openMockupTab(photobookId, 'offer')}>{assigned ? 'Cambia modelli' : 'Assegna modello'}</Button>
        </Step>
        <Step n={3} title="Chi prepara la bozza?" done>
          <fieldset className="space-y-2" disabled={pathBusy}>
            <legend className="sr-only">Chi prepara la bozza</legend>
            <label className="flex items-start gap-2 text-sm"><input type="radio" name="mockup-path" className="mt-1" checked={studio} onChange={() => onPathChange('studio')} /><span><strong>Io preparo e confermo</strong><small className="block text-muted-foreground">Il cliente riceve l’email solo quando la bozza è confermata.</small></span></label>
            <label className="flex items-start gap-2 text-sm"><input type="radio" name="mockup-path" className="mt-1" checked={!studio} onChange={() => onPathChange('client')} /><span><strong>Il cliente sceglie tra i modelli assegnati</strong><small className="block text-muted-foreground">Appena approva le pagine riceve il link e personalizza da solo.</small></span></label>
          </fieldset>
          {studio && <Button variant="outline" className="min-h-11" disabled={readOnly || !assigned} onClick={() => openMockupTab(photobookId, 'edit')}>{saved ? 'Modifica la bozza' : 'Prepara la bozza'}</Button>}
        </Step>
        <Step n={4} title="Stato e invio al cliente" done={saved?.status === 'confirmed'}>
          <p className="text-sm">{saved ? `Bozza: ${MOCKUP_STATUS_LABELS[saved.status || 'draft']} · revisione ${saved.revision}` : 'Nessuna bozza ancora.'}</p>
          <p className="text-sm">Email: {emailStatus}</p>
          {emailNote && <p className="text-sm text-amber-700">{emailNote}</p>}
          <div className="flex flex-wrap gap-2">
            {saved && <Button variant="outline" className="min-h-11" onClick={() => openMockupTab(photobookId, 'review')}>Rivedi e conferma</Button>}
            {emailActions}
          </div>
        </Step>
      </ol>
    </CardContent></Card>
  );
}
