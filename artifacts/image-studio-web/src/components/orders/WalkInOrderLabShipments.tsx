import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  Send,
  Trash2,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import LabFileUploader from "@/components/jobs/operativo/LabFileUploader";
import LabSendFeedback from "@/components/jobs/operativo/LabSendFeedback";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  createShipment,
  deleteShipment,
  daysUntilExpiry,
  getWalkInOrderShipments,
  sendShipment,
  tsToDate,
  updateShipment,
} from "@/lib/labShipments";
import { getAllLabs } from "@/lib/labs";
import { shipmentAccentHue, shipmentPresentation } from "@/lib/lab-shipment-feedback";
import {
  LAB_SHIPMENT_DEFAULT_EXPIRY_DAYS,
  LAB_SHIPMENT_STATUS_LABELS,
  type Lab,
  type LabShipment,
  type LabShipmentStatus,
} from "@shared/lab-types";

interface WalkInOrderForLab {
  id: string;
  nomeCliente?: string;
  nomeEvento?: string;
  note?: string | null;
  prodotti?: Array<{ prodottoNome?: string; quantita?: number }>;
}

const MANUAL_STATUSES: LabShipmentStatus[] = [
  "da_inviare",
  "inviato",
  "in_stampa",
  "ricevuto",
];

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function shipmentTitle(order: WalkInOrderForLab): string {
  const title = order.nomeEvento?.trim() || "Ordine walk-in";
  return [
    title,
    order.nomeCliente?.trim(),
  ]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 500);
}

export default function WalkInOrderLabShipments({
  order,
}: {
  order: WalkInOrderForLab;
}) {
  const { toast } = useToast();
  const queryKey = ["/api/lab-shipments/order", order.id];
  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [newLabId, setNewLabId] = useState("");
  const [expandedShipmentId, setExpandedShipmentId] = useState<string | null>(null);

  const shipmentsQuery = useQuery<LabShipment[]>({
    queryKey,
    queryFn: () => getWalkInOrderShipments(order.id),
  });
  const labsQuery = useQuery<Lab[]>({
    queryKey: ["/api/labs", { attiviOnly: true }],
    queryFn: () => getAllLabs(true),
  });
  const labs = labsQuery.data || [];

  const createMutation = useMutation({
    mutationFn: () => {
      if (!newLabId) throw new Error("Seleziona il laboratorio destinatario");
      return createShipment({
        orderId: order.id,
        sourceType: "walk_in",
        descrizione: shipmentTitle(order),
        labId: newLabId,
        expiryDays: LAB_SHIPMENT_DEFAULT_EXPIRY_DAYS,
      });
    },
    onSuccess: (shipment) => {
      queryClient.invalidateQueries({ queryKey });
      setCreateFormOpen(false);
      setExpandedShipmentId(shipment.id);
      toast({
        title: "Invio laboratorio creato",
        description: "Aggiungi i materiali e invia il link al laboratorio.",
      });
    },
    onError: (error: Error) =>
      toast({
        title: "Errore creazione invio",
        description: error.message,
        variant: "destructive",
      }),
  });

  const shipments = shipmentsQuery.data || [];
  const shipmentCards = shipmentPresentation(shipments);

  return (
    <section
      className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4"
      data-testid="walk-in-lab-shipments"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Truck className="h-4 w-4 text-slate-600" />
            Invii al laboratorio
            {shipments.length > 0 && (
              <Badge variant="secondary">{shipments.length}</Badge>
            )}
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            La distinta includerà i prodotti e la descrizione dell’ordine. I file
            su Drive vengono eliminati automaticamente al termine dei 20 giorni;
            ordine e cassa restano invariati.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setNewLabId(labs[0]?.id || "");
            setCreateFormOpen((open) => !open);
          }}
          disabled={labsQuery.isLoading || labs.length === 0}
          data-testid="button-new-walk-in-lab-shipment"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Nuovo invio
        </Button>
      </div>

      {createFormOpen && (
        <div className="flex flex-col gap-2 rounded-md border bg-white p-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Laboratorio destinatario
            </label>
            <Select value={newLabId || undefined} onValueChange={setNewLabId}>
              <SelectTrigger data-testid="select-new-walk-in-lab">
                <SelectValue placeholder="Seleziona un laboratorio" />
              </SelectTrigger>
              <SelectContent>
                {labs.map((lab) => (
                  <SelectItem key={lab.id} value={lab.id}>
                    {lab.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => createMutation.mutate()}
            disabled={!newLabId || createMutation.isPending}
            data-testid="button-create-walk-in-lab-shipment"
          >
            {createMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Crea invio
          </Button>
        </div>
      )}

      {labsQuery.isError && (
        <p role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          Impossibile caricare l’elenco dei laboratori.
        </p>
      )}
      {!labsQuery.isLoading && !labsQuery.isError && labs.length === 0 && (
        <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          Non ci sono laboratori attivi. Aggiungine uno nella sezione Laboratori
          prima di creare un invio.
        </p>
      )}

      {shipmentsQuery.isLoading && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Caricamento invii…
        </p>
      )}
      {shipmentsQuery.isError && (
        <p role="alert" className="text-xs text-red-700">
          Impossibile caricare gli invii: {(shipmentsQuery.error as Error).message}
        </p>
      )}
      {!shipmentsQuery.isLoading && !shipmentsQuery.isError && shipments.length === 0 && (
        <p className="rounded border border-dashed bg-white p-3 text-xs text-muted-foreground">
          Nessun invio creato per questo ordine.
        </p>
      )}

      <div className="space-y-2">
        {shipmentCards.map(({ shipment, sequence }) => (
          <WalkInShipmentCard
            key={shipment.id}
            shipment={shipment}
            labs={labs}
            sequence={sequence}
            expanded={expandedShipmentId === shipment.id}
            onToggle={() =>
              setExpandedShipmentId((current) =>
                current === shipment.id ? null : shipment.id,
              )
            }
            onChanged={() => queryClient.invalidateQueries({ queryKey })}
          />
        ))}
      </div>
    </section>
  );
}

function WalkInShipmentCard({
  shipment,
  labs,
  sequence,
  expanded,
  onToggle,
  onChanged,
}: {
  shipment: LabShipment;
  labs: Lab[];
  sequence: number;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const hue = shipmentAccentHue(sequence);
  const accentColor = `hsl(${hue} 62% 46%)`;
  const accentTint = `hsl(${hue} 76% 97%)`;
  const files = shipment.files || [];
  const attachments = files.filter((file) => file.kind !== "manifest");
  const expired = shipment.status === "scaduto" || shipment.deletedFromDrive === true;
  const expiresAt = tsToDate(shipment.expiresAt);
  const dateSent = tsToDate(shipment.sentAt);
  const remainingDays = daysUntilExpiry(shipment.expiresAt);
  const labOptions = [...labs];
  if (shipment.labId && !labOptions.some((lab) => lab.id === shipment.labId)) {
    labOptions.push({
      id: shipment.labId,
      nome: shipment.labNome || "Laboratorio",
      email: shipment.labEmail || "",
      attivo: false,
    } as Lab);
  }

  const labMutation = useMutation({
    mutationFn: (labId: string) => updateShipment(shipment.id, { labId }),
    onSuccess: onChanged,
    onError: (error: Error) =>
      toast({ title: "Errore aggiornamento laboratorio", description: error.message, variant: "destructive" }),
  });
  const statusMutation = useMutation({
    mutationFn: (status: LabShipmentStatus) => updateShipment(shipment.id, { status }),
    onSuccess: onChanged,
    onError: (error: Error) =>
      toast({ title: "Errore aggiornamento stato", description: error.message, variant: "destructive" }),
  });
  const sendMutation = useMutation({
    mutationFn: () => sendShipment(shipment.id, shipment.labId),
    onSuccess: (updated) => {
      queryClient.setQueryData<LabShipment[]>(
        ["/api/lab-shipments/order", shipment.orderId],
        (current) => current?.map((item) => item.id === updated.id ? updated : item),
      );
      queryClient.invalidateQueries({ queryKey: ["/api/lab-shipments", shipment.id] });
      queryClient.invalidateQueries({ queryKey: ["recent-lab-shipments"] });
      onChanged();
      toast({
        title: "Link inviato al laboratorio",
        description: `Email inviata${updated.labNome ? ` a ${updated.labNome}` : ""}.`,
      });
    },
    onError: (error: Error) =>
      toast({ title: "Errore invio", description: error.message, variant: "destructive" }),
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteShipment(shipment.id),
    onSuccess: () => {
      onChanged();
      toast({
        title: "Invio eliminato",
        description: "File e scheda dell’invio rimossi; ordine e movimenti di cassa non sono stati modificati.",
      });
    },
    onError: (error: Error) =>
      toast({ title: "Errore eliminazione invio", description: error.message, variant: "destructive" }),
  });

  return (
    <div
      className="overflow-hidden rounded-md border bg-white"
      style={{ borderColor: `hsl(${hue} 42% 80%)` }}
      data-testid={`walk-in-shipment-${shipment.id}`}
    >
      <div
        className="flex items-center gap-2 border-l-4 px-3 py-2"
        style={{ backgroundColor: accentTint, borderLeftColor: accentColor }}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 text-left"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={`walk-in-shipment-details-${shipment.id}`}
          data-testid={`walk-in-shipment-toggle-${shipment.id}`}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold"
              style={{
                backgroundColor: `hsl(${hue} 80% 90%)`,
                color: `hsl(${hue} 62% 25%)`,
              }}
            >
              Invio #{sequence}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {shipment.labNome || shipment.descrizione || "Invio laboratorio"}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {shipment.descrizione || "Ordine walk-in"}
              </span>
            </span>
          </span>
          <span className="flex items-center gap-2">
            <Badge variant="secondary">
              {LAB_SHIPMENT_STATUS_LABELS[shipment.status] || shipment.status}
            </Badge>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {attachments.length} allegati
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </span>
        </button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700"
              disabled={uploading || deleteMutation.isPending}
              aria-label={`Elimina invio ${sequence}`}
              data-testid={`button-delete-walk-in-shipment-${shipment.id}`}
            >
              {deleteMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Trash2 className="h-4 w-4" />}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminare questo invio?</AlertDialogTitle>
              <AlertDialogDescription>
                Verranno rimossi la cartella Drive e la scheda dell’invio.
                L’ordine walk-in e i relativi movimenti di cassa resteranno invariati.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() => deleteMutation.mutate()}
              >
                Elimina invio
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {expanded && (
        <div
          id={`walk-in-shipment-details-${shipment.id}`}
          className="space-y-3 p-3"
        >
          {shipment.walkInOrderSnapshot?.orderDescription && (
            <div className="rounded border bg-slate-50 p-2 text-xs">
              <p className="font-medium text-slate-700">Descrizione inclusa nella distinta</p>
              <p className="mt-1 whitespace-pre-wrap text-slate-600">
                {shipment.walkInOrderSnapshot.orderDescription}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Laboratorio
              </label>
              <Select
                value={shipment.labId || undefined}
                onValueChange={(labId) => labMutation.mutate(labId)}
                disabled={expired || uploading || labMutation.isPending || sendMutation.isPending}
              >
                <SelectTrigger data-testid={`select-walk-in-lab-${shipment.id}`}>
                  <SelectValue placeholder="Seleziona laboratorio" />
                </SelectTrigger>
                <SelectContent>
                  {labOptions.map((lab) => (
                    <SelectItem key={lab.id} value={lab.id}>
                      {lab.nome}{lab.attivo === false ? " (non attivo)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Stato invio
              </label>
              <Select
                value={shipment.status}
                onValueChange={(value) => statusMutation.mutate(value as LabShipmentStatus)}
                disabled={expired || statusMutation.isPending}
              >
                <SelectTrigger data-testid={`select-walk-in-status-${shipment.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MANUAL_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {LAB_SHIPMENT_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                  {expired && (
                    <SelectItem value="scaduto" disabled>
                      {LAB_SHIPMENT_STATUS_LABELS.scaduto}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {expired ? (
            <p className="flex items-start gap-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              I file sono stati eliminati da Google Drive dopo la scadenza.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
                <FileText className="h-4 w-4" />
                Materiali e distinta
              </div>
              <LabFileUploader
                shipmentId={shipment.id}
                kind="supplemental"
                label="Aggiungi materiali"
                disabled={sendMutation.isPending || labMutation.isPending}
                onUploadingChange={setUploading}
                onUploaded={onChanged}
              />
            </div>
          )}

          {files.length > 0 && (
            <ul className="space-y-1">
              {files.map((file) => (
                <li
                  key={file.driveFileId}
                  className="flex min-w-0 items-center justify-between gap-2 rounded bg-slate-50 px-2.5 py-2 text-xs"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                    {file.webViewLink ? (
                      <a
                        href={file.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-blue-700 hover:underline"
                      >
                        {file.kind === "manifest" ? "Distinta laboratorio" : file.name}
                      </a>
                    ) : (
                      <span className="truncate">
                        {file.kind === "manifest" ? "Distinta laboratorio" : file.name}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {formatFileSize(file.size)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {shipment.shareableLink && !expired && (
            <a
              href={shipment.shareableLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-blue-700 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Apri cartella Google Drive
            </a>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <div className="text-xs text-muted-foreground">
              {dateSent
                ? `Inviato il ${dateSent.toLocaleDateString("it-IT")}${remainingDays !== null ? ` · ${remainingDays > 0 ? `${remainingDays} giorni alla scadenza` : remainingDays === 0 ? "scadenza oggi" : `scaduto da ${Math.abs(remainingDays)} giorni`}` : ""}${expiresAt ? ` · eliminazione ${expiresAt.toLocaleDateString("it-IT")}` : ""}`
                : `Scadenza file: ${LAB_SHIPMENT_DEFAULT_EXPIRY_DAYS} giorni dopo l’invio`}
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => sendMutation.mutate()}
              disabled={
                expired ||
                attachments.length === 0 ||
                !shipment.labId ||
                uploading ||
                sendMutation.isPending ||
                shipment.sendState?.status === "sending"
              }
              data-testid={`button-send-walk-in-shipment-${shipment.id}`}
            >
              {sendMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {shipment.sentAt ? "Reinvia link" : "Invia link"}
            </Button>
          </div>
          <LabSendFeedback
            shipment={shipment}
            pending={sendMutation.isPending}
            error={sendMutation.error as Error | null}
          />
        </div>
      )}
    </div>
  );
}
