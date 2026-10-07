import type { FinanceLedgerEntry, FinanceReceivable } from "@/lib/finance-types";
import { Badge } from "@/components/ui/badge";
import { eur, fmtDate, SOURCE_LABELS } from "./finance-format";

const cell = "px-3 py-2 align-top";
const link = "text-left underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 min-h-[32px]";

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</div>;
}

export function MovementsTable({ rows, onOpen }: { rows: FinanceLedgerEntry[]; onOpen: (e: FinanceLedgerEntry) => void }) {
  if (!rows.length) return <EmptyNote>Nessun movimento con questi filtri.</EmptyNote>;
  const sorted = [...rows].sort((a, b) => (b.date?.getTime() ?? -Infinity) - (a.date?.getTime() ?? -Infinity));
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[620px] text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr><th className={cell}>Data pagamento</th><th className={cell}>Descrizione</th><th className={cell}>Origine</th><th className={cell}>Metodo</th><th className={`${cell} text-right`}>Importo</th></tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map((r) => (
            <tr key={r.id} data-testid={`finance-movement-${r.id}`}>
              <td className={`${cell} whitespace-nowrap`}>{r.date ? fmtDate(r.date) : <Badge variant="outline">Data non registrata</Badge>}</td>
              <td className={cell}>
                <button type="button" className={link} onClick={() => onOpen(r)}>{r.description || r.customer || "Movimento"}</button>
                {r.customer && <div className="text-xs text-muted-foreground">{r.customer}</div>}
                {r.kind === "refund" && <Badge variant="outline">Rimborso / storno</Badge>}
                {r.kind === "cost" && <Badge variant="outline">Costo lavoro</Badge>}
              </td>
              <td className={cell}>{SOURCE_LABELS[r.source]}</td>
              <td className={cell}>{r.method || "-"}</td>
              <td className={`${cell} whitespace-nowrap text-right font-semibold tabular-nums ${r.direction === "income" ? "text-emerald-700" : "text-rose-700"}`}>
                {r.direction === "income" ? "+" : "-"}{eur(r.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STATUS_LABEL = { future: "Futuro", overdue: "Scaduto", undated: "Senza data" } as const;
const STATUS_CLASS = {
  future: "bg-sky-100 text-sky-900",
  overdue: "bg-rose-100 text-rose-900",
  undated: "bg-amber-100 text-amber-900",
} as const;

export function ReceivablesTable({ rows, onOpen }: { rows: FinanceReceivable[]; onOpen: (r: FinanceReceivable) => void }) {
  if (!rows.length) return <EmptyNote>Nessun importo da incassare in questa selezione.</EmptyNote>;
  const sorted = [...rows].sort((a, b) => (a.date?.getTime() ?? Infinity) - (b.date?.getTime() ?? Infinity));
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr><th className={cell}>Scadenza</th><th className={cell}>Voce</th><th className={cell}>Stato</th><th className={cell}>Natura</th><th className={`${cell} text-right`}>Residuo</th></tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map((r) => (
            <tr key={r.id} data-testid={`finance-receivable-${r.id}`}>
              <td className={`${cell} whitespace-nowrap`}>{r.date ? fmtDate(r.date) : "Nessuna data"}</td>
              <td className={cell}>
                <button type="button" className={link} onClick={() => onOpen(r)}>{r.label}</button>
                <div className="text-xs text-muted-foreground">{[r.customer, SOURCE_LABELS[r.source]].filter(Boolean).join(" - ")}</div>
              </td>
              <td className={cell}><span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
              <td className={cell}>{r.scheduled ? "Rata programmata" : "Stima"}</td>
              <td className={`${cell} whitespace-nowrap text-right font-semibold tabular-nums`}>{eur(r.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
