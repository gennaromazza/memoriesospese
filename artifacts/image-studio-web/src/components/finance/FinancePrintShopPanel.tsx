import type { FinancePrintShopMargin } from "@/lib/finance-types";
import { eur, fmtDate } from "./finance-format";

export default function FinancePrintShopPanel({ rows }: { rows: FinancePrintShopMargin[] }) {
  if (!rows.length) {
    return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Nessun ordine di stampa nel periodo selezionato.</div>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        I costi unitari sono snapshot interni; i consuntivi del laboratorio sostituiscono la stima copie nel calcolo.
        Ricavi, commissioni e spese di cassa non vengono duplicati.
      </p>
      <div className="max-h-[640px] overflow-auto rounded-lg border">
        <table className="min-w-[1000px] w-full text-left text-sm">
          <thead className="sticky top-0 bg-muted text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">Ordine / cliente</th>
              <th className="p-3 text-right">Incassato</th>
              <th className="p-3 text-right">Copie · stima</th>
              <th className="p-3 text-right">Laboratorio · effettivo</th>
              <th className="p-3 text-right">PayPal</th>
              <th className="p-3 text-right">Margine</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.orderId} className="align-top hover:bg-muted/30">
                <td className="max-w-64 p-3">
                  <div className="font-medium">{row.orderNumber}</div>
                  <div className="text-xs text-muted-foreground">{row.customerName || "Cliente"} · {fmtDate(row.date)}</div>
                </td>
                <td className="p-3 text-right tabular-nums">{eur(row.revenueCents / 100)}</td>
                <td className="p-3 text-right tabular-nums">
                  {row.estimatedPrintCostCents === null ? "Non disponibile" : eur(row.estimatedPrintCostCents / 100)}
                </td>
                <td className="p-3 text-right tabular-nums">
                  {row.supplierCostCents === null ? "Non disponibile" : eur(row.supplierCostCents / 100)}
                </td>
                <td className="p-3 text-right tabular-nums">
                  {row.paypalFeeCents === null ? "Non disponibile" : eur(row.paypalFeeCents / 100)}
                </td>
                <td className="p-3 text-right">
                  <div className="font-semibold tabular-nums">
                    {row.marginCents === null ? "Non determinabile" : eur(row.marginCents / 100)}
                  </div>
                  <div className={`text-xs ${
                    row.marginStatus === "incomplete" ? "text-amber-700" :
                      row.marginStatus === "actual" ? "text-emerald-700" : "text-blue-700"
                  }`}>
                    {row.marginStatus === "actual" ? "Consuntivo" :
                      row.marginStatus === "estimated" ? "Stima" : "Incompleto"}
                  </div>
                  {!!row.missingReasons.length && (
                    <div className="mt-1 max-w-72 text-left text-xs text-amber-700">
                      {row.missingReasons.join(" ")}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
