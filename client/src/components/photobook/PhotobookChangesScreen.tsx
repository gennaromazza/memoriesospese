/**
 * Schermata admin "Modifiche Fotolibro": tutte le richieste dei clienti
 * raggruppate per cliente → fotolibro → versione → pagina, con copia elenco
 * e gestione stato (da fare / completata / rifiutata).
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  listPhotobookChangeRequests,
  updatePhotobookChangeRequest,
  type PhotobookChangeRequest,
} from '@/lib/photobooks';
import {
  photobookMarkColorName,
  type PhotobookChangeRequestStatus,
} from '@shared/photobook-types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Check,
  ChevronDown,
  Copy,
  Loader2,
  MessageSquareText,
  Replace,
  Trash2,
  BookImage,
} from 'lucide-react';

const TYPE_LABEL: Record<string, string> = {
  replace: 'Sostituisci foto',
  delete: 'Elimina foto',
  edit: 'Modifica richiesta',
};

const STATUS_LABEL: Record<PhotobookChangeRequestStatus, string> = {
  pending: 'Da fare',
  done: 'Completata',
  rejected: 'Rifiutata',
};

interface BookGroup {
  key: string;
  clientName: string;
  galleryName: string;
  photobookName: string;
  versions: Map<number, Map<number, PhotobookChangeRequest[]>>; // version → pageNumber → requests
}

function requestLine(r: PhotobookChangeRequest): string {
  const colorName = photobookMarkColorName(r.markColor);
  const base = colorName ? `Pag. ${r.pageNumber} [X ${colorName}]` : `Pag. ${r.pageNumber}`;
  const orig = r.originalPhotoName ? ` [${r.originalPhotoName}]` : '';
  if (r.type === 'replace') {
    return `${base}${orig} → SOSTITUIRE con ${r.replacementPhotoName || r.replacementPhotoId}${r.note ? ` (nota: ${r.note})` : ''}`;
  }
  if (r.type === 'delete') {
    return `${base}${orig} → ELIMINARE${r.note ? ` (nota: ${r.note})` : ''}`;
  }
  return `${base}${orig} → MODIFICA: ${r.note}`;
}

/** Pulsantino copia negli appunti con feedback ✓ per 1.5s. */
function CopyNameButton({ text, testId }: { text: string; testId: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast({
            title: 'Copia non riuscita',
            description: 'Copia il nome manualmente.',
            variant: 'destructive',
          });
        }
      }}
      className="inline-flex items-center justify-center w-5 h-5 rounded border bg-white hover:bg-stone-50 text-stone-500 shrink-0 align-middle"
      title={`Copia "${text}"`}
      data-testid={testId}
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-600" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );
}

export default function PhotobookChangesScreen() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<'all' | PhotobookChangeRequestStatus>('pending');
  const [expandedBooks, setExpandedBooks] = useState<Set<string>>(new Set());

  const toggleBook = (key: string) =>
    setExpandedBooks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['/api/photobooks/requests'],
    queryFn: listPhotobookChangeRequests,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: PhotobookChangeRequestStatus }) =>
      updatePhotobookChangeRequest(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/photobooks/requests'] }),
    onError: (e: any) =>
      toast({ title: 'Errore aggiornamento stato', description: e.message, variant: 'destructive' }),
  });

  const filtered = useMemo(
    () => (statusFilter === 'all' ? requests : requests.filter((r) => r.status === statusFilter)),
    [requests, statusFilter],
  );

  const groups = useMemo(() => {
    const map = new Map<string, BookGroup>();
    for (const r of filtered) {
      const key = r.photobookId;
      if (!map.has(key)) {
        map.set(key, {
          key,
          clientName: r.clientName || 'Cliente',
          galleryName: r.galleryName || '',
          photobookName: r.photobookName || 'Fotolibro',
          versions: new Map(),
        });
      }
      const g = map.get(key)!;
      if (!g.versions.has(r.version)) g.versions.set(r.version, new Map());
      const pages = g.versions.get(r.version)!;
      if (!pages.has(r.pageNumber)) pages.set(r.pageNumber, []);
      pages.get(r.pageNumber)!.push(r);
    }
    return Array.from(map.values()).sort((a, b) => a.clientName.localeCompare(b.clientName));
  }, [filtered]);

  // Con un solo lavoro, aprilo automaticamente (resta comunque richiudibile)
  const singleGroupKey = groups.length === 1 ? groups[0].key : null;
  useEffect(() => {
    if (!singleGroupKey) return;
    setExpandedBooks((prev) =>
      prev.has(singleGroupKey) ? prev : new Set(prev).add(singleGroupKey),
    );
  }, [singleGroupKey]);

  const copyList = (group: BookGroup, version: number) => {
    const pages = group.versions.get(version);
    if (!pages) return;
    const lines: string[] = [
      `MODIFICHE FOTOLIBRO — ${group.photobookName} (v${version})`,
      `Cliente: ${group.clientName}${group.galleryName ? ` · Galleria: ${group.galleryName}` : ''}`,
      '',
    ];
    const sortedPages = Array.from(pages.keys()).sort((a, b) => a - b);
    for (const pn of sortedPages) {
      for (const r of pages.get(pn)!) {
        lines.push(`- ${requestLine(r)}`);
      }
    }
    navigator.clipboard.writeText(lines.join('\n'));
    toast({ title: 'Elenco copiato', description: 'Incollalo dove preferisci (email, note, ecc.).' });
  };

  const typeIcon = (type: string) =>
    type === 'replace' ? (
      <Replace className="h-3.5 w-3.5" />
    ) : type === 'delete' ? (
      <Trash2 className="h-3.5 w-3.5" />
    ) : (
      <MessageSquareText className="h-3.5 w-3.5" />
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">
          Richieste di modifica inviate dai clienti dalle pagine di revisione fotolibro.
        </p>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="w-44" data-testid="select-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Da fare</SelectItem>
            <SelectItem value="done">Completate</SelectItem>
            <SelectItem value="rejected">Rifiutate</SelectItem>
            <SelectItem value="all">Tutte</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <BookImage className="h-10 w-10 mx-auto mb-3 opacity-40" />
            Nessuna richiesta {statusFilter !== 'all' ? `(${STATUS_LABEL[statusFilter as PhotobookChangeRequestStatus].toLowerCase()})` : ''}.
          </CardContent>
        </Card>
      ) : (
        groups.map((group) => {
          const requestCount = Array.from(group.versions.values()).reduce(
            (tot, pages) =>
              tot + Array.from(pages.values()).reduce((s, reqs) => s + reqs.length, 0),
            0,
          );
          const isExpanded = expandedBooks.has(group.key);
          return (
          <Card key={group.key} data-testid={`card-changes-${group.key}`}>
            <CardContent className="pt-5 space-y-4">
              <button
                type="button"
                onClick={() => toggleBook(group.key)}
                className="w-full flex items-center justify-between gap-3 text-left"
                aria-expanded={isExpanded}
                data-testid={`button-toggle-book-${group.key}`}
              >
                <div className="min-w-0">
                  <h3 className="font-semibold truncate">{group.clientName}</h3>
                  <p className="text-xs text-muted-foreground truncate">
                    {group.photobookName}
                    {group.galleryName ? ` · Galleria: ${group.galleryName}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="secondary">
                    {requestCount} {requestCount === 1 ? 'richiesta' : 'richieste'}
                  </Badge>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform ${
                      isExpanded ? 'rotate-180' : ''
                    }`}
                  />
                </div>
              </button>

              {isExpanded && Array.from(group.versions.keys())
                .sort((a, b) => b - a)
                .map((version) => {
                  const pages = group.versions.get(version)!;
                  const sortedPages = Array.from(pages.keys()).sort((a, b) => a - b);
                  return (
                    <div key={version} className="border rounded-md p-3 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="secondary">Versione {version}</Badge>
                        <Button size="sm" variant="outline" onClick={() => copyList(group, version)} data-testid={`button-copy-list-${group.key}-${version}`}>
                          <Copy className="h-3.5 w-3.5 mr-1.5" />
                          Copia elenco
                        </Button>
                      </div>

                      {sortedPages.map((pn) => {
                        const pageRequests = pages.get(pn)!;
                        // Snapshot più recente della pagina (le richieste sono già
                        // ordinate dalla più recente; le legacy a slot non ne hanno)
                        const snapshotUrl =
                          pageRequests.find((r) => r.snapshotUrl)?.snapshotUrl || null;
                        return (
                        <div key={pn} className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase">
                            Pagina {pn}
                          </p>
                          {snapshotUrl && (
                            <a
                              href={snapshotUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="block max-w-md rounded-md overflow-hidden border bg-muted hover:opacity-90 transition-opacity"
                              title="Apri lo snapshot a grandezza intera"
                              data-testid={`link-snapshot-${group.key}-${version}-${pn}`}
                            >
                              <img
                                src={snapshotUrl}
                                alt={`Pagina ${pn} con le X del cliente`}
                                loading="lazy"
                                className="w-full h-auto"
                              />
                            </a>
                          )}
                          {pageRequests.map((r) => (
                            <div
                              key={r.id}
                              className="flex items-start gap-3 border rounded-md p-2.5 flex-wrap"
                              data-testid={`row-request-${r.id}`}
                            >
                              {r.markColor && (
                                <span
                                  className="inline-block w-3.5 h-3.5 rounded-full border mt-1 shrink-0"
                                  style={{ backgroundColor: r.markColor }}
                                  title={`X ${photobookMarkColorName(r.markColor)}`}
                                  data-testid={`dot-mark-color-${r.id}`}
                                />
                              )}
                              <div className="flex items-center gap-2 shrink-0">
                                {r.originalPhotoThumbnailUrl && (
                                  <img
                                    src={r.originalPhotoThumbnailUrl}
                                    alt={r.originalPhotoName || 'foto'}
                                    className="w-12 h-12 rounded object-cover border"
                                  />
                                )}
                                {r.type === 'replace' && r.replacementPhotoThumbnailUrl && (
                                  <>
                                    <span className="text-muted-foreground">→</span>
                                    <img
                                      src={r.replacementPhotoThumbnailUrl}
                                      alt={r.replacementPhotoName || 'sostituta'}
                                      className="w-12 h-12 rounded object-cover border"
                                    />
                                  </>
                                )}
                              </div>
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="flex items-center gap-1.5 text-sm font-medium">
                                  {typeIcon(r.type)}
                                  {TYPE_LABEL[r.type]}
                                  {r.markColor && (
                                    <span className="text-xs text-muted-foreground font-normal">
                                      · X {photobookMarkColorName(r.markColor)}
                                    </span>
                                  )}
                                </div>
                                {r.originalPhotoName && (
                                  <p className="text-xs text-muted-foreground break-all flex items-center gap-1.5 flex-wrap">
                                    <CopyNameButton
                                      text={r.originalPhotoName}
                                      testId={`button-copy-original-${r.id}`}
                                    />
                                    Foto: {r.originalPhotoName}
                                  </p>
                                )}
                                {r.replacementPhotoName && (
                                  <p className="text-xs text-muted-foreground break-all flex items-center gap-1.5 flex-wrap">
                                    <CopyNameButton
                                      text={r.replacementPhotoName}
                                      testId={`button-copy-replacement-${r.id}`}
                                    />
                                    Sostituire con: {r.replacementPhotoName}
                                  </p>
                                )}
                                {r.note && <p className="text-xs italic">"{r.note}"</p>}
                              </div>
                              <Select
                                value={r.status}
                                onValueChange={(v) =>
                                  statusMutation.mutate({ id: r.id, status: v as PhotobookChangeRequestStatus })
                                }
                              >
                                <SelectTrigger className="w-36 h-8 text-xs shrink-0" data-testid={`select-request-status-${r.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pending">Da fare</SelectItem>
                                  <SelectItem value="done">Completata</SelectItem>
                                  <SelectItem value="rejected">Rifiutata</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          ))}
                        </div>
                        );
                      })}
                    </div>
                  );
                })}
            </CardContent>
          </Card>
          );
        })
      )}
    </div>
  );
}
