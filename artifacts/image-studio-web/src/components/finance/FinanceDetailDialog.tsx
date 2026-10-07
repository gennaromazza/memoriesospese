import { Link } from "wouter";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { FinanceLedgerEntry, FinanceReceivable } from "@/lib/finance-types";
import { eur, fmtDate, SOURCE_LABELS } from "./finance-format";

export type FinanceDetail =
  | { kind: "entry"; entry: FinanceLedgerEntry }
  | { kind: "receivable"; item: FinanceReceivable }
  | null;

const STATUS: Record<FinanceReceivable["status"], string> = {
  future: "Futuro",
  overdue: "Scaduto",
  undated: "Senza data",
};

function Row({ k, v }: { k: string; v?: string | null }) {
  if (!v) return null;
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="min-w-0 break-words">{v}</dd>
    </div>
  );
}

export default function FinanceDetailDialog({ detail, onClose }: { detail: FinanceDetail; onClose: () => void }) {
  const d = detail;
  const jobId = d ? (d.kind === "entry" ? d.entry.jobId : d.item.jobId) : undefined;
  return (
    <Dialog open={!!d} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto" data-testid="finance-detail-dialog">
        {d?.kind === "entry" && (
          <>
            <DialogHeader>
              <DialogTitle className="font-playfair">{d.entry.kind === "refund" ? "Rimborso / storno" : d.entry.kind === "cost" ? "Costo lavoro" : d.entry.direction === "income" ? "Incasso" : "Uscita"} di {eur(d.entry.amount)}</DialogTitle>
              <DialogDescription>{d.entry.description || "Nessuna descrizione"}</DialogDescription>
            </DialogHeader>
            <dl className="divide-y">
              <Row k="Data pagamento" v={fmtDate(d.entry.date, true)} />
              <Row k="Origine" v={SOURCE_LABELS[d.entry.source]} />
              <Row k="Cliente" v={d.entry.customer} />
              <Row k="Metodo" v={d.entry.method} />
              <Row k="Lavoro" v={d.entry.jobId} />
              <Row k="Ordine" v={d.entry.orderId} />
              <Row k="Prenotazione" v={d.entry.bookingId} />
              <Row k="Campagna" v={d.entry.campaignId} />
              <Row k="Riferimenti" v={d.entry.references.join(", ")} />
            </dl>
          </>
        )}
        {d?.kind === "receivable" && (
          <>
            <DialogHeader>
              <DialogTitle className="font-playfair">Da incassare: {eur(d.item.amount)}</DialogTitle>
              <DialogDescription>{d.item.label}</DialogDescription>
            </DialogHeader>
            <dl className="divide-y">
              <Row k="Stato" v={STATUS[d.item.status]} />
              <Row k="Scadenza" v={d.item.date ? fmtDate(d.item.date) : "Nessuna data"} />
              <Row k="Natura" v={d.item.scheduled ? "Rata programmata" : "Stima del residuo"} />
              <Row k="Tipo" v={d.item.paymentType} />
              <Row k="Origine" v={SOURCE_LABELS[d.item.source]} />
              <Row k="Cliente" v={d.item.customer} />
              <Row k="Lavoro" v={d.item.jobId} />
              <Row k="Ordine" v={d.item.orderId} />
              <Row k="Prenotazione" v={d.item.bookingId} />
              <Row k="Campagna" v={d.item.campaignId} />
            </dl>
          </>
        )}
        {jobId && (
          <Link href={`/admin/jobs/${jobId}`} className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
            Apri scheda lavoro
          </Link>
        )}
      </DialogContent>
    </Dialog>
  );
}
