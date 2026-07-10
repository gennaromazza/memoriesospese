/**
 * Schermata admin "Modifiche Fotolibro": tutte le richieste dei clienti
 * raggruppate per cliente → fotolibro → versione → pagina, con copia elenco
 * e gestione stato (da fare / completata / rifiutata).
 */

import { useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  listPhotobookChangeRequests,
  updatePhotobookChangeRequest,
  type PhotobookChangeRequest,
} from '@/lib/photobooks';
import type { PhotobookChangeRequestStatus } from '@shared/photobook-types';
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
import { Copy, Loader2, MessageSquareText, Replace, Trash2, BookImage } from 'lucide-react';

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
  const base = `Pag. ${r.pageNumber}`;
  const orig = r.originalPhotoName ? ` [${r.originalPhotoName}]` : '';
  if (r.type === 'replace') {
    return `${base}${orig} → SOSTITUIRE con ${r.replacementPhotoName || r.replacementPhotoId}${r.note ? ` (nota: ${r.note})` : ''}`;
  }
  if (r.type === 'delete') {
    return `${base}${orig} → ELIMINARE${r.note ? ` (nota: ${r.note})` : ''}`;
  }
  return `${base}${orig} → MODIFICA: ${r.note}`;
}

export default function PhotobookChangesScreen() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<'all' | PhotobookChangeRequestStatus>('pending');

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
        groups.map((group) => (
          <Card key={group.key} data-testid={`card-changes-${group.key}`}>
            <CardContent className="pt-5 space-y-4">
              <div>
                <h3 className="font-semibold">{group.clientName}</h3>
                <p className="text-xs text-muted-foreground">
                  {group.photobookName}
                  {group.galleryName ? ` · Galleria: ${group.galleryName}` : ''}
                </p>
              </div>

              {Array.from(group.versions.keys())
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

                      {sortedPages.map((pn) => (
                        <div key={pn} className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase">
                            Pagina {pn}
                          </p>
                          {pages.get(pn)!.map((r) => (
                            <div
                              key={r.id}
                              className="flex items-start gap-3 border rounded-md p-2.5 flex-wrap"
                              data-testid={`row-request-${r.id}`}
                            >
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
                                </div>
                                {r.originalPhotoName && (
                                  <p className="text-xs text-muted-foreground break-all">
                                    Foto: {r.originalPhotoName}
                                  </p>
                                )}
                                {r.replacementPhotoName && (
                                  <p className="text-xs text-muted-foreground break-all">
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
                      ))}
                    </div>
                  );
                })}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
