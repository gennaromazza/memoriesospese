import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  Send,
  Trash2,
  ExternalLink,
  Clock,
  AlertTriangle,
  ChevronDown,
  Loader2,
} from "lucide-react";
import LabFileUploader from "./LabFileUploader";
import LabSendFeedback from "./LabSendFeedback";
import {
  updateShipment,
  sendShipment,
  setShipmentCost,
  deleteShipment,
  tsToDate,
  daysUntilExpiry,
  formatFileSize,
} from "@/lib/labShipments";
import {
  LAB_SHIPMENT_STATUS_LABELS,
  type Lab,
  type LabShipment,
  type LabShipmentStatus,
} from "@shared/lab-types";
import { shipmentAccentHue } from "@/lib/lab-shipment-feedback";

interface LabShipmentItemProps {
  shipment: LabShipment;
  labs: Lab[];
  jobId: string;
  sequence?: number;
  expanded: boolean;
  onToggle: () => void;
}

const STATUS_BADGE: Record<LabShipmentStatus, string> = {
  da_inviare: "bg-gray-100 text-gray-700 hover:bg-gray-100",
  inviato: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  in_stampa: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  ricevuto: "bg-green-100 text-green-700 hover:bg-green-100",
  scaduto: "bg-red-100 text-red-700 hover:bg-red-100",
};

// Stati impostabili manualmente dall'admin
const MANUAL_STATUSES: LabShipmentStatus[] = [
  "da_inviare",
  "inviato",
  "in_stampa",
  "ricevuto",
];

function formatDate(value: any): string {
  const d = tsToDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function LabShipmentItem({
  shipment,
  labs,
  jobId,
  sequence,
  expanded,
  onToggle,
}: LabShipmentItemProps) {
  const { toast } = useToast();
  const queryKey = ["/api/lab-shipments/job", jobId];
  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const [selectedLabId, setSelectedLabId] = useState(shipment.labId || "");
  const [uploading, setUploading] = useState(false);
  const [costoInput, setCostoInput] = useState(
    shipment.costoImporto != null ? String(shipment.costoImporto) : "",
  );

  const files = Array.isArray(shipment.files) ? shipment.files : [];
  const hasFiles = files.length > 0;
  const isSent = !!shipment.sentAt;
  const isExpired = shipment.status === "scaduto";
  const transferBlocked = shipment.mockupDispatching || shipment.pageTransfer?.status === "running"
    || ["uploading", "needs_review"].includes(shipment.mockupTransfer?.status || "");
  const daysLeft = daysUntilExpiry(shipment.expiresAt);
  const accentHue = shipmentAccentHue(sequence ?? 1);
  const accentColor = `hsl(${accentHue} 62% 46%)`;
  const accentTint = `hsl(${accentHue} 76% 97%)`;
  const sentSummary = tsToDate(shipment.sentAt)?.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
  });

  // Opzioni laboratorio (includi quello già selezionato anche se non più attivo)
  const labOptions = [...labs];
  if (
    shipment.labId &&
    !labOptions.some((l) => l.id === shipment.labId)
  ) {
    labOptions.push({
      id: shipment.labId,
      nome: shipment.labNome || "Laboratorio",
      email: shipment.labEmail || "",
      attivo: false,
    } as Lab);
  }

  const labMut = useMutation({
    mutationFn: (labId: string) => updateShipment(shipment.id, { labId }),
    onSuccess: () => invalidate(),
    onError: (e: any) =>
      toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const statusMut = useMutation({
    mutationFn: (status: LabShipmentStatus) =>
      updateShipment(shipment.id, { status }),
    onSuccess: () => invalidate(),
    onError: (e: any) =>
      toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const sendMut = useMutation({
    mutationFn: () => sendShipment(shipment.id, selectedLabId || undefined),
    onSuccess: (updated) => {
      queryClient.setQueryData<LabShipment[]>(queryKey, previous =>
        previous?.map(item => item.id === updated.id ? updated : item),
      );
      queryClient.setQueryData(["/api/lab-shipments", shipment.id], updated);
      queryClient.invalidateQueries({ queryKey: ["recent-lab-shipments"] });
      toast({
        title: "Link inviato",
        description: `Email inviata${updated.labNome ? ` a ${updated.labNome}` : ""} con il link ai file.`,
      });
      invalidate();
    },
    onError: (e: any) =>
      toast({
        title: "Errore invio",
        description: e.message,
        variant: "destructive",
      }),
  });

  const costMut = useMutation({
    mutationFn: (importo: number) => setShipmentCost(shipment.id, importo, selectedLabId),
    onSuccess: () => {
      toast({
        title: "Costo salvato",
        description: "Costo fornitore aggiornato sul lavoro.",
      });
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["/api/labs/costs-report"] });
    },
    onError: (e: any) =>
      toast({
        title: "Errore costo",
        description: e.message,
        variant: "destructive",
      }),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteShipment(shipment.id),
    onSuccess: () => {
      toast({
        title: "Spedizione eliminata",
        description: "File su Drive e costo collegato rimossi.",
      });
      invalidate();
    },
    onError: (e: any) =>
      toast({
        title: "Errore eliminazione",
        description: e.message,
        variant: "destructive",
      }),
  });

  const handleLabChange = (labId: string) => {
    setSelectedLabId(labId);
    labMut.mutate(labId);
  };

  const handleSaveCosto = () => {
    const value = parseFloat(costoInput.replace(",", "."));
    if (isNaN(value) || value < 0) {
      toast({
        title: "Importo non valido",
        description: "Inserisci un importo valido.",
        variant: "destructive",
      });
      return;
    }
    costMut.mutate(value);
  };

  return (
    <Card
      className="overflow-hidden border"
      style={{ borderColor: `hsl(${accentHue} 42% 80%)` }}
      data-testid={`shipment-${shipment.id}`}
      data-shipment-sequence={sequence}
    >
      <CardContent className="p-0">
        <div
          className="flex items-center gap-2 border-l-4 px-2 py-2 sm:px-3"
          style={{ backgroundColor: accentTint, borderLeftColor: accentColor }}
        >
          <button
            type="button"
            className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={expanded}
            aria-controls={`shipment-details-${shipment.id}`}
            aria-label={`${expanded ? "Nascondi" : "Mostra"} dettagli spedizione #${sequence ?? 1}: ${shipment.descrizione || "Spedizione"}`}
            data-testid={`shipment-toggle-${shipment.id}`}
            onClick={onToggle}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold"
                style={{
                  backgroundColor: `hsl(${accentHue} 80% 90%)`,
                  color: `hsl(${accentHue} 62% 25%)`,
                }}
                data-testid={`shipment-color-${shipment.id}`}
              >
                Spedizione #{sequence ?? 1}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-gray-900">
                  {shipment.descrizione || "Spedizione"}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {shipment.labNome || "Laboratorio da scegliere"}
                </span>
              </span>
            </span>

            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Badge className={STATUS_BADGE[shipment.status]}>
                {LAB_SHIPMENT_STATUS_LABELS[shipment.status]}
              </Badge>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                {files.length} file
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {sentSummary ? `Email ${sentSummary}` : "Da inviare"}
              </span>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </span>
          </button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-red-500 hover:text-red-600 hover:bg-red-50 shrink-0"
                data-testid={`button-delete-shipment-${shipment.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminare la spedizione?</AlertDialogTitle>
                <AlertDialogDescription>
                  Verranno eliminati definitivamente i file caricati su Google
                  Drive e l'eventuale costo fornitore collegato al lavoro.
                  L'operazione non è reversibile.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-600 hover:bg-red-700"
                  onClick={() => deleteMut.mutate()}
                >
                  Elimina
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div id={`shipment-details-${shipment.id}`} hidden={!expanded}>
          {expanded && <div className="space-y-4 p-4">
        {/* Laboratorio destinatario */}
        {(shipment.mockupDispatching || ['uploading', 'needs_review'].includes(shipment.mockupTransfer?.status || '')) && <p role="status" className="rounded border border-amber-300 p-2 text-sm">Trasferimento mockup o invio in corso / da verificare. Non ripetere l’invio: controlla la cartella Drive e lo stato prima di procedere.</p>}
        {shipment.mockupSnapshot && <p className="rounded border p-2 text-sm">Mockup allegato: {shipment.mockupSnapshot.modelName} · fotolibro v{shipment.mockupSnapshot.version} · revisione {shipment.mockupSnapshot.revision}. Questa copia non cambia modificando il mockup corrente.</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              Laboratorio
            </label>
            <Select
              value={selectedLabId}
              onValueChange={handleLabChange}
              disabled={isExpired || uploading || labMut.isPending || sendMut.isPending}
            >
              <SelectTrigger data-testid={`select-lab-${shipment.id}`}>
                <SelectValue placeholder="Seleziona laboratorio" />
              </SelectTrigger>
              <SelectContent>
                {labOptions.length === 0 && (
                  <SelectItem value="__none__" disabled>
                    Nessun laboratorio in anagrafica
                  </SelectItem>
                )}
                {labOptions.map((lab) => (
                  <SelectItem key={lab.id} value={lab.id}>
                    {lab.nome}
                    {lab.attivo === false ? " (non attivo)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              Stato spedizione
            </label>
            <Select
              value={shipment.status}
              onValueChange={(v) => statusMut.mutate(v as LabShipmentStatus)}
              disabled={isExpired}
            >
              <SelectTrigger data-testid={`select-status-${shipment.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MANUAL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {LAB_SHIPMENT_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
                {isExpired && (
                  <SelectItem value="scaduto" disabled>
                    {LAB_SHIPMENT_STATUS_LABELS.scaduto}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* File caricati */}
        <div>
          <div className="mb-2 space-y-2">
            <span className="text-xs font-medium text-gray-600">
              File ({files.length})
            </span>
            {!isExpired && (
              <LabFileUploader
                shipmentId={shipment.id}
                onUploaded={invalidate}
                disabled={sendMut.isPending || labMut.isPending || transferBlocked}
                onUploadingChange={setUploading}
              />
            )}
          </div>
          {isExpired ? (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-md p-3">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              File eliminati automaticamente da Google Drive dopo la scadenza.
            </div>
          ) : hasFiles ? (
            <ul className="space-y-1">
              {files.map((f) => (
                <li
                  key={f.driveFileId}
                  className="flex items-center justify-between text-sm bg-gray-50 rounded-md px-3 py-2"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                    <span className="truncate">{f.name}</span>
                  </span>
                  <span className="text-xs text-gray-500 shrink-0 ml-2">
                    {formatFileSize(f.size)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400 italic">
              Nessun file caricato.
            </p>
          )}
        </div>

        {/* Link condiviso + scadenza */}
        {shipment.shareableLink && !isExpired && (
          <div className="flex items-center justify-between gap-2 bg-blue-50 rounded-md px-3 py-2">
            <a
              href={shipment.shareableLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-blue-700 hover:underline min-w-0"
              data-testid={`link-drive-${shipment.id}`}
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              <span className="truncate">Apri cartella su Drive</span>
            </a>
          </div>
        )}

        {isSent && !isExpired && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Clock className="h-4 w-4 shrink-0" />
            <span>
              Inviato il {formatDate(shipment.sentAt)} · Disponibile fino al{" "}
              {formatDate(shipment.expiresAt)}
              {daysLeft != null && (
                <span
                  className={`ml-1 font-medium ${
                    daysLeft <= 3 ? "text-red-600" : "text-gray-700"
                  }`}
                >
                  ({daysLeft > 0 ? `${daysLeft} giorni rimanenti` : "in scadenza"})
                </span>
              )}
            </span>
          </div>
        )}

        {/* Azioni: invio + costo */}
        <LabSendFeedback shipment={shipment} pending={sendMut.isPending} error={sendMut.error} />
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 pt-2 border-t border-gray-100">
          {!isExpired && (
            <Button
              onClick={() => sendMut.mutate()}
              disabled={!hasFiles || !selectedLabId || sendMut.isPending || uploading || labMut.isPending
                || transferBlocked}
              className="bg-[#8b5a3c] hover:bg-[#6b4a2c] text-white"
              data-testid={`button-send-${shipment.id}`}
            >
              {sendMut.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {sendMut.isPending ? "Invio in corso…" : uploading ? "Attendi il caricamento…" : isSent ? "Reinvia link" : "Invia al laboratorio"}
            </Button>
          )}
          <div className="flex items-end gap-2">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">
                Costo fornitore (€)
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={costoInput}
                onChange={(e) => setCostoInput(e.target.value)}
                placeholder="0.00"
                className="w-32"
                data-testid={`input-cost-${shipment.id}`}
              />
            </div>
            <Button
              onClick={handleSaveCosto}
              disabled={costMut.isPending}
              className="bg-[#6b7f6b] hover:bg-[#5a6e5a] text-white"
              data-testid={`button-save-cost-${shipment.id}`}
            >
              {costMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Salva costo"
              )}
            </Button>
          </div>
        </div>
          </div>}
        </div>
      </CardContent>
    </Card>
  );
}
