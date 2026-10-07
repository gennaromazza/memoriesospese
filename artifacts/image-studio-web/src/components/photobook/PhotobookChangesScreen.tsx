/**
 * Schermata admin "Modifiche Fotolibro": tutte le richieste dei clienti
 * raggruppate per cliente → fotolibro → versione → pagina, con copia elenco
 * e gestione stato (da fare / completata / rifiutata).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  CopyFeedbackButton,
  PhotobookEmptyState,
  PhotobookErrorState,
  PhotobookLoadingState,
} from "./PhotobookUiStates";
import {
  listPhotobookChangeRequests,
  updatePhotobookChangeRequest,
  type PhotobookChangeRequest,
} from "@/lib/photobooks";
import {
  photobookMarkColorName,
  type PhotobookChangeRequestStatus,
} from "@shared/photobook-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, MessageSquareText, Replace, Trash2 } from "lucide-react";

type StatusFilter = "all" | PhotobookChangeRequestStatus;

const TYPE_LABEL: Record<string, string> = {
  replace: "Sostituisci foto",
  delete: "Elimina foto",
  edit: "Modifica richiesta",
};

const STATUS_LABEL: Record<PhotobookChangeRequestStatus, string> = {
  pending: "Da fare",
  done: "Completata",
  rejected: "Rifiutata",
};

interface BookGroup {
  key: string;
  clientName: string;
  galleryName: string;
  photobookName: string;
  /** FIX: precalcolato, evitato il ricalcolo O(n²) a ogni render. */
  requestCount: number;
  /** version → pageNumber → requests */
  versions: Map<number, Map<number, PhotobookChangeRequest[]>>;
}

function requestLine(r: PhotobookChangeRequest): string {
  // FIX: guard su `markColor` prima di passarlo a photobookMarkColorName,
  // che con valore assente può restituire undefined invece di stringa vuota.
  const colorName = r.markColor ? photobookMarkColorName(r.markColor) : "";
  const base = colorName
    ? `Pag. ${r.pageNumber} [X ${colorName}]`
    : `Pag. ${r.pageNumber}`;
  const orig = r.originalPhotoName ? ` [${r.originalPhotoName}]` : "";
  if (r.type === "replace") {
    return `${base}${orig} → SOSTITUIRE con ${
      r.replacementPhotoName || r.replacementPhotoId
    }${r.note ? ` (nota: ${r.note})` : ""}`;
  }
  if (r.type === "delete") {
    return `${base}${orig} → ELIMINARE${r.note ? ` (nota: ${r.note})` : ""}`;
  }
  return `${base}${orig} → MODIFICA: ${r.note ?? ""}`;
}

/** FIX: componente stabile invece di funzione che ricrea JSX a ogni render. */
function TypeIcon({ type }: { type: string }) {
  if (type === "replace")
    return <Replace className="h-3.5 w-3.5" aria-hidden="true" />;
  if (type === "delete")
    return <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />;
  return <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />;
}

export default function PhotobookChangesScreen() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [expandedBooks, setExpandedBooks] = useState<Set<string>>(
    () => new Set(),
  );

  const toggleBook = useCallback((key: string) => {
    setExpandedBooks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const {
    data: requests = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["/api/photobooks/requests"],
    queryFn: listPhotobookChangeRequests,
    // Le richieste arrivano dai clienti in qualsiasi momento: niente cache
    // "fresca" (staleTime globale 5 min), ricarica sempre all'apertura del tab
    staleTime: 0,
    refetchOnMount: "always",
  });

  const statusMutation = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: PhotobookChangeRequestStatus;
    }) => updatePhotobookChangeRequest(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["/api/photobooks/requests"],
      });
    },
    onError: (error: unknown) => {
      // FIX: `any` → `unknown` con guard: il messaggio non è mai undefined.
      const message =
        error instanceof Error ? error.message : "Errore sconosciuto";
      toast({
        title: "Errore aggiornamento stato",
        description: message,
        variant: "destructive",
      });
    },
  });

  // FIX: un solo `isPending` globale disabilitava TUTTI i select della pagina.
  // Tracciamo l'id in corso così solo la riga interessata si blocca.
  const pendingRequestId = statusMutation.isPending
    ? statusMutation.variables?.id
    : undefined;

  const filtered = useMemo(
    () =>
      statusFilter === "all"
        ? requests
        : requests.filter((r) => r.status === statusFilter),
    [requests, statusFilter],
  );

  const groups = useMemo<BookGroup[]>(() => {
    const map = new Map<string, BookGroup>();
    for (const r of filtered) {
      const key = r.photobookId;
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          clientName: r.clientName || "Cliente",
          galleryName: r.galleryName || "",
          photobookName: r.photobookName || "Fotolibro",
          requestCount: 0,
          versions: new Map(),
        };
        map.set(key, g);
      }
      // FIX: requestCount incrementale qui, invece di un reduce O(n²) nel render.
      g.requestCount += 1;
      let pages = g.versions.get(r.version);
      if (!pages) {
        pages = new Map();
        g.versions.set(r.version, pages);
      }
      let list = pages.get(r.pageNumber);
      if (!list) {
        list = [];
        pages.set(r.pageNumber, list);
      }
      list.push(r);
    }
    // FIX: tie-breaker per stabilità dell'ordinamento (due clienti omonimi
    // non devono scambiarsi di posto tra un render e l'altro).
    return Array.from(map.values()).sort(
      (a, b) =>
        a.clientName.localeCompare(b.clientName) ||
        a.photobookName.localeCompare(b.photobookName),
    );
  }, [filtered]);

  // Con un solo lavoro, aprilo automaticamente (resta comunque richiudibile)
  const singleGroupKey = groups.length === 1 ? groups[0].key : null;
  useEffect(() => {
    if (!singleGroupKey) return;
    setExpandedBooks((prev) => {
      if (prev.has(singleGroupKey)) return prev;
      const next = new Set(prev);
      next.add(singleGroupKey);
      return next;
    });
  }, [singleGroupKey]);

  // FIX: pulizia delle chiavi orfane in `expandedBooks` quando i gruppi cambiano
  // (es. cambio filtro). Evita di accumulare id di fotolibri non più presenti.
  useEffect(() => {
    const validKeys = new Set(groups.map((g) => g.key));
    setExpandedBooks((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const k of prev) {
        if (validKeys.has(k)) next.add(k);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [groups]);

  const copyList = useCallback((group: BookGroup, version: number): string => {
    const pages = group.versions.get(version);
    if (!pages) return "";
    const lines: string[] = [
      `MODIFICHE FOTOLIBRO — ${group.photobookName} (v${version})`,
      `Cliente: ${group.clientName}${
        group.galleryName ? ` · Galleria: ${group.galleryName}` : ""
      }`,
      "",
    ];
    const sortedPages = Array.from(pages.keys()).sort((a, b) => a - b);
    for (const pn of sortedPages) {
      for (const r of pages.get(pn) ?? []) {
        lines.push(`- ${requestLine(r)}`);
      }
    }
    return lines.join("\n");
  }, []);

  // FIX: handler tipizzato, elimina il cast `as any` nel Select.
  const onFilterChange = useCallback((value: string) => {
    setStatusFilter(value as StatusFilter);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">
          Richieste di modifica inviate dai clienti dalle pagine di revisione
          fotolibro.
        </p>
        <label className="flex items-center gap-2 text-sm font-medium">
          <span>Stato richieste</span>
          <Select value={statusFilter} onValueChange={onFilterChange}>
            <SelectTrigger
              aria-label="Filtra richieste per stato"
              className="w-44"
              data-testid="select-status-filter"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Da fare</SelectItem>
              <SelectItem value="done">Completate</SelectItem>
              <SelectItem value="rejected">Rifiutate</SelectItem>
              <SelectItem value="all">Tutte</SelectItem>
            </SelectContent>
          </Select>
        </label>
      </div>

      {isLoading ? (
        <PhotobookLoadingState label="Caricamento richieste…" />
      ) : isError ? (
        <PhotobookErrorState
          title="Richieste non disponibili"
          message="Non riesco a caricare le modifiche dei clienti."
          onRetry={() => void refetch()}
        />
      ) : groups.length === 0 ? (
        <PhotobookEmptyState
          title="Nessuna richiesta"
          message={
            // FIX: con il tipo stretto `StatusFilter` il cast a
            // PhotobookChangeRequestStatus non serve più.
            statusFilter !== "all"
              ? `Non ci sono richieste ${STATUS_LABEL[statusFilter].toLowerCase()}.`
              : "Le richieste inviate dai clienti appariranno qui."
          }
        />
      ) : (
        groups.map((group) => {
          const isExpanded = expandedBooks.has(group.key);
          const panelId = `book-panel-${group.key}`;
          return (
            <Card key={group.key} data-testid={`card-changes-${group.key}`}>
              <CardContent className="pt-5 space-y-4">
                {/*
                  FIX: un <h3> dentro <button> è HTML non valido
                  (button accetta solo phrasing content, non heading).
                  Sostituito con <span> visivamente equivalente.
                  Aggiunti aria-controls e aria-hidden sui decorativi.
                */}
                <button
                  type="button"
                  onClick={() => toggleBook(group.key)}
                  className="w-full flex items-center justify-between gap-3 text-left"
                  aria-expanded={isExpanded}
                  aria-controls={panelId}
                  data-testid={`button-toggle-book-${group.key}`}
                >
                  <span className="min-w-0">
                    <span className="block font-semibold truncate">
                      {group.clientName}
                    </span>
                    <span className="block text-xs text-muted-foreground truncate">
                      {group.photobookName}
                      {group.galleryName
                        ? ` · Galleria: ${group.galleryName}`
                        : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary">
                      {group.requestCount}{" "}
                      {group.requestCount === 1 ? "richiesta" : "richieste"}
                    </Badge>
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground transition-transform ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                      aria-hidden="true"
                    />
                  </span>
                </button>

                {isExpanded && (
                  <div id={panelId} className="space-y-4">
                    {Array.from(group.versions.keys())
                      .sort((a, b) => b - a)
                      .map((version) => {
                        const pages = group.versions.get(version)!;
                        const sortedPages = Array.from(pages.keys()).sort(
                          (a, b) => a - b,
                        );
                        return (
                          <div
                            key={version}
                            className="border rounded-md p-3 space-y-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <Badge variant="secondary">
                                Versione {version}
                              </Badge>
                              <CopyFeedbackButton
                                text={copyList(group, version)}
                                label="Copia elenco"
                                testId={`button-copy-list-${group.key}-${version}`}
                              />
                            </div>

                            {sortedPages.map((pn) => {
                              const pageRequests = pages.get(pn)!;
                              const snapshotUrl =
                                pageRequests.find((r) => r.snapshotUrl)
                                  ?.snapshotUrl ?? null;
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
                                          style={{
                                            backgroundColor: r.markColor,
                                          }}
                                          title={`X ${photobookMarkColorName(r.markColor)}`}
                                          data-testid={`dot-mark-color-${r.id}`}
                                        />
                                      )}
                                      <div className="flex items-center gap-2 shrink-0">
                                        {r.originalPhotoThumbnailUrl && (
                                          <img
                                            src={r.originalPhotoThumbnailUrl}
                                            alt={r.originalPhotoName || "foto"}
                                            className="w-12 h-12 rounded object-cover border"
                                          />
                                        )}
                                        {r.type === "replace" &&
                                          r.replacementPhotoThumbnailUrl && (
                                            <>
                                              <span
                                                className="text-muted-foreground"
                                                aria-hidden="true"
                                              >
                                                →
                                              </span>
                                              <img
                                                src={
                                                  r.replacementPhotoThumbnailUrl
                                                }
                                                alt={
                                                  r.replacementPhotoName ||
                                                  "foto sostitutiva"
                                                }
                                                className="w-12 h-12 rounded object-cover border"
                                              />
                                            </>
                                          )}
                                      </div>
                                      <div className="min-w-0 flex-1 space-y-0.5">
                                        <div className="flex items-center gap-1.5 text-sm font-medium">
                                          <TypeIcon type={r.type} />
                                          {TYPE_LABEL[r.type] ?? r.type}
                                          {r.markColor && (
                                            <span className="text-xs text-muted-foreground font-normal">
                                              · X{" "}
                                              {photobookMarkColorName(
                                                r.markColor,
                                              )}
                                            </span>
                                          )}
                                        </div>
                                        {r.originalPhotoName && (
                                          <p className="text-xs text-muted-foreground break-all flex items-center gap-1.5 flex-wrap">
                                            <CopyFeedbackButton
                                              text={r.originalPhotoName}
                                              label="Copia nome"
                                              testId={`button-copy-original-${r.id}`}
                                            />
                                            Foto: {r.originalPhotoName}
                                          </p>
                                        )}
                                        {r.replacementPhotoName && (
                                          <p className="text-xs text-muted-foreground break-all flex items-center gap-1.5 flex-wrap">
                                            <CopyFeedbackButton
                                              text={r.replacementPhotoName}
                                              label="Copia nome"
                                              testId={`button-copy-replacement-${r.id}`}
                                            />
                                            Sostituire con:{" "}
                                            {r.replacementPhotoName}
                                          </p>
                                        )}
                                        {r.note && (
                                          <p className="text-xs italic">
                                            "{r.note}"
                                          </p>
                                        )}
                                      </div>
                                      <Select
                                        value={r.status}
                                        onValueChange={(v) =>
                                          statusMutation.mutate({
                                            id: r.id,
                                            status:
                                              v as PhotobookChangeRequestStatus,
                                          })
                                        }
                                      >
                                        <SelectTrigger
                                          aria-label={`Stato richiesta per pagina ${r.pageNumber}`}
                                          // FIX: disabilita solo la riga in corso.
                                          disabled={pendingRequestId === r.id}
                                          className="w-36 h-10 text-xs shrink-0"
                                          data-testid={`select-request-status-${r.id}`}
                                        >
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="pending">
                                            Da fare
                                          </SelectItem>
                                          <SelectItem value="done">
                                            Completata
                                          </SelectItem>
                                          <SelectItem value="rejected">
                                            Rifiutata
                                          </SelectItem>
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
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
