import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import type { LabShipment } from "@shared/lab-types";
import { tsToDate } from "@/lib/labShipments";
import { shipmentHasNewFiles } from "@/lib/lab-shipment-feedback";

export default function LabSendFeedback({ shipment, pending, error }: {
  shipment: LabShipment; pending: boolean; error?: Error | null;
}) {
  const sentAt = tsToDate(shipment.sentAt);
  return (
    <div className="space-y-2 text-xs" data-testid={`send-feedback-${shipment.id}`}>
      {pending && (
        <p role="status" className="flex items-center gap-2 rounded border border-blue-200 bg-blue-50 p-2 text-blue-800">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          Invio email in corso… Attendi prima di inviare di nuovo.
        </p>
      )}
      {error && !pending && (
        <p role="alert" className="flex items-start gap-2 rounded border border-red-200 bg-red-50 p-2 text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Invio non confermato: {error.message}
        </p>
      )}
      {sentAt && (
        <p className="flex items-start gap-2 rounded border border-green-200 bg-green-50 p-2 text-green-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Ultima email inviata{shipment.labNome ? ` a ${shipment.labNome}` : ""}: {sentAt.toLocaleString("it-IT", { timeZone: "Europe/Rome" })}.
        </p>
      )}
      {shipmentHasNewFiles(shipment) && (
        <p role="status" className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-2 text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          File aggiunti dopo l’ultima email. Il link Drive è aggiornato; reinvia l’email per avvisare il laboratorio.
        </p>
      )}
    </div>
  );
}
