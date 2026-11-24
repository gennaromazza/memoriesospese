import './_group.css';

import {
  CheckCircle2,
  ChevronDown,
  Copy,
  Lock,
  MessageSquareWarning,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Truck,
  Unlock,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type Book = {
  id: string;
  name: string;
  galleryName?: string;
  jobId?: string;
  clientName: string;
  version: number;
  pageCount: number;
  versions: number;
  pending?: number;
  approved?: boolean;
  locked?: boolean;
  mockup: 'unassigned' | 'draft' | 'submitted' | 'confirmed';
  mockupDescription?: string;
  shipment?: boolean;
};

const books: Book[] = [
  {
    id: 'pb-vincenzo',
    name: 'Vincenzo e Ilenia',
    galleryName: 'Matrimonio Vincenzo e Ilenia',
    jobId: 'job-vincenzo',
    clientName: 'Vincenzo e Ilenia',
    version: 3,
    pageCount: 48,
    versions: 3,
    pending: 2,
    mockup: 'unassigned',
  },
  {
    id: 'pb-mattia',
    name: 'Mattia Alma',
    galleryName: 'Matrimonio Mattia Alma',
    jobId: 'job-mattia',
    clientName: 'Mattia Alma',
    version: 2,
    pageCount: 36,
    versions: 2,
    mockup: 'draft',
    mockupDescription: 'Album fotografico · bozza da preparare',
  },
  {
    id: 'pb-biagio',
    name: 'Biagio e Roberta',
    galleryName: 'Matrimonio Biagio e Roberta',
    jobId: 'job-biagio',
    clientName: 'Biagio e Roberta',
    version: 4,
    pageCount: 52,
    versions: 4,
    pending: 1,
    mockup: 'submitted',
  },
  {
    id: 'pb-angelo',
    name: 'Angelo e Carolina',
    galleryName: 'Matrimonio Angelo e Carolina',
    jobId: 'job-angelo',
    clientName: 'Angelo e Carolina',
    version: 2,
    pageCount: 44,
    versions: 2,
    approved: true,
    mockup: 'confirmed',
  },
  {
    id: 'pb-emilio',
    name: 'Emilio e Ilaria',
    clientName: 'Emilio e Ilaria',
    version: 1,
    pageCount: 28,
    versions: 1,
    mockup: 'draft',
    mockupDescription: 'Custodia · bozza da preparare',
  },
  {
    id: 'pb-gennaro',
    name: 'Gennaro e Sara',
    galleryName: 'Matrimonio Gennaro e Sara',
    jobId: 'job-gennaro',
    clientName: 'Gennaro e Sara',
    version: 3,
    pageCount: 50,
    versions: 3,
    approved: true,
    locked: true,
    mockup: 'confirmed',
    shipment: true,
  },
];

const noop = () => undefined;

function MockupStatus({ book }: { book: Book }) {
  const descriptions: Record<Book['mockup'], string> = {
    unassigned: 'Modello non ancora assegnato',
    draft: `Mockup: ${book.mockupDescription}`,
    submitted: 'Mockup: da verificare',
    confirmed: 'Mockup: confermato dallo studio',
  };

  if (book.mockup === 'unassigned') {
    return (
      <div
        className="flex flex-wrap items-center gap-2 rounded-md border border-muted bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
        role="status"
        data-testid={`mockup-status-${book.id}`}
      >
        <span>{descriptions[book.mockup]}</span>
        <Button type="button" size="sm" variant="outline" className="h-8" onClick={noop}>
          Assegna modello
        </Button>
      </div>
    );
  }

  return (
    <p className="text-xs text-muted-foreground" data-testid={`mockup-status-${book.id}`}>
      {descriptions[book.mockup]}
    </p>
  );
}

function renderBook(book: Book) {
  const sourceLabel =
    book.galleryName || (book.jobId ? 'Senza galleria · lavoro collegato' : 'Fotolibro autonomo');

  return (
    <Card
      key={book.id}
      id={`photobook-materials-${book.id}`}
      tabIndex={-1}
      className="focus:ring-2 focus:ring-primary focus:outline-none"
      data-testid={`card-photobook-${book.id}`}
    >
      <CardContent className="pt-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold truncate">{book.name}</h3>
            <p className="text-xs text-muted-foreground truncate">
              {sourceLabel}
              {book.clientName ? ` · ${book.clientName}` : ''}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge variant="secondary">v{book.version}</Badge>
            {(book.pending || 0) > 0 && (
              <Badge
                className="bg-amber-500 text-white hover:bg-amber-600 cursor-pointer"
                onClick={noop}
                data-testid={`badge-pending-changes-${book.id}`}
              >
                <MessageSquareWarning className="h-3 w-3 mr-1" />
                {book.pending} {book.pending === 1 ? 'modifica' : 'modifiche'}
              </Badge>
            )}
            {book.approved && (
              <Badge
                className="bg-green-600 text-white hover:bg-green-600"
                data-testid={`badge-approved-${book.id}`}
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Approvato
              </Badge>
            )}
            {book.locked && (
              <Badge
                className="bg-stone-700 text-white hover:bg-stone-700"
                data-testid={`badge-locked-${book.id}`}
              >
                <Lock className="h-3 w-3 mr-1" />
                Modifiche bloccate
              </Badge>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {book.pageCount} pagine · {book.versions} {book.versions === 1 ? 'versione' : 'versioni'}
        </p>
        <MockupStatus book={book} />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={noop} data-testid={`button-edit-photobook-${book.id}`}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Apri editor
          </Button>
          <Button size="sm" variant="outline" onClick={noop}>
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Copia link cliente
          </Button>
          {!book.locked && book.approved && (
            <Button size="sm" variant="outline" onClick={noop} data-testid={`button-reset-approval-${book.id}`}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Annulla approvazione
            </Button>
          )}
          {book.locked ? (
            <Button size="sm" variant="outline" onClick={noop} data-testid={`button-unlock-${book.id}`}>
              <Unlock className="h-3.5 w-3.5 mr-1.5" />
              Sblocca
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={noop} data-testid={`button-lock-${book.id}`}>
              <Lock className="h-3.5 w-3.5 mr-1.5" />
              Manda in stampa
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={noop}
            data-testid={`button-delete-photobook-${book.id}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        {book.shipment && (
          <div className="mt-3 rounded-md border bg-muted/30 p-3 text-sm space-y-1.5">
            <div className="font-medium flex items-center gap-1.5">
              <Truck className="h-4 w-4" />
              Spedizione laboratorio
              <Badge variant="secondary" className="ml-1">In preparazione</Badge>
            </div>
            <p className="text-xs" role="status">Spedizione pronta · email non ancora inviata.</p>
            <p className="text-muted-foreground">
              Laboratorio: AlbumLab · Pagine trasferite: {book.pageCount}/{book.pageCount} · Scadenza: 30/06/2026 (30 gg)
            </p>
          </div>
        )}
        {book.locked && !book.shipment && (
          <div className="rounded border p-3 text-sm space-y-2">
            <p>Modifiche bloccate. Nessuna spedizione preparata e nessuna email inviata.</p>
            <Button size="sm" variant="outline" onClick={noop}>Prepara spedizione laboratorio</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function Current() {
  const activeLinkedBooks = books.filter((book) => !book.locked && !!(book.jobId || book.galleryName));
  const activeStandaloneBooks = books.filter((book) => !book.locked && !book.jobId && !book.galleryName);
  const archivedLinkedBooks = books.filter((book) => book.locked && !!(book.jobId || book.galleryName));
  const archivedStandaloneBooks = books.filter((book) => book.locked && !book.jobId && !book.galleryName);
  const archivedCount = archivedLinkedBooks.length + archivedStandaloneBooks.length;

  return (
    <div className="photobooks-dashboard min-h-screen bg-background text-foreground p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">
          Carica le pagine, invia al cliente il link per l’approvazione e prepara il mockup.
          Puoi creare fotolibri collegati a un lavoro o autonomi.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={noop}>Tutorial</Button>
          <Button onClick={noop} data-testid="button-create-photobook">
            <Plus className="h-4 w-4 mr-2" />
            Nuovo Fotolibro
          </Button>
        </div>
      </div>

      <button
        type="button"
        onClick={noop}
        className="w-full flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-left hover:bg-amber-100 transition-colors"
        data-testid="banner-pending-changes"
      >
        <MessageSquareWarning className="h-5 w-5 text-amber-600 shrink-0" />
        <span className="text-sm text-amber-900">
          <span className="font-semibold">3 richieste di modifica</span>{' '}
          in attesa dai clienti — clicca per aprire "Modifiche Fotolibro"
        </span>
      </button>

      <div className="space-y-6">
        {activeLinkedBooks.length > 0 && (
          <section className="space-y-3" data-testid="section-linked-photobooks">
            <div>
              <h3 className="font-semibold">Fotolibri collegati</h3>
              <p className="text-xs text-muted-foreground">Associati a un lavoro o a una galleria.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {activeLinkedBooks.map(renderBook)}
            </div>
          </section>
        )}
        {activeStandaloneBooks.length > 0 && (
          <section className="space-y-3" data-testid="section-standalone-photobooks">
            <div>
              <h3 className="font-semibold">Fotolibri autonomi</h3>
              <p className="text-xs text-muted-foreground">
                Senza lavoro e galleria: le pagine si caricano direttamente nell’editor.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {activeStandaloneBooks.map(renderBook)}
            </div>
          </section>
        )}
        {archivedCount > 0 && (
          <div className="space-y-3" data-testid="section-archived-photobooks">
            <button
              type="button"
              onClick={noop}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              aria-expanded={true}
              data-testid="button-toggle-archived"
            >
              <ChevronDown className="h-4 w-4" />
              Coda stampa · fotolibri con modifiche bloccate ({archivedCount})
            </button>
            <div className="space-y-5">
              <p className="text-xs text-muted-foreground">
                Il blocco impedisce al cliente di modificare l’album, ma non conferma che
                l’email sia stata inviata. Se non risulta ancora inviata, controlla lo stato
                e completa l’invio dal riquadro “Spedizione laboratorio”.
              </p>
              {archivedLinkedBooks.length > 0 && (
                <section data-testid="section-archived-linked-photobooks">
                  <h4 className="mb-2 text-sm font-medium">Collegati</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {archivedLinkedBooks.map(renderBook)}
                  </div>
                </section>
              )}
              {archivedStandaloneBooks.length > 0 && (
                <section data-testid="section-archived-standalone-photobooks">
                  <h4 className="mb-2 text-sm font-medium">Autonomi</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {archivedStandaloneBooks.map(renderBook)}
                  </div>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
