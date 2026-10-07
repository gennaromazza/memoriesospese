import { useState } from "react";
import type { FinanceCampaign, FinanceLedgerEntry, FinanceReceivable } from "@/lib/finance-types";
import { Button } from "@/components/ui/button";
import { campaignTag, eur } from "./finance-format";
import { EmptyNote, MovementsTable, ReceivablesTable } from "./FinanceTables";

type Props = {
  periodCampaigns: FinanceCampaign[];
  allCampaigns: FinanceCampaign[];
  periodLabel: string;
  searching?: boolean;
  onOpenEntry: (e: FinanceLedgerEntry) => void;
  onOpenReceivable: (r: FinanceReceivable) => void;
};

export default function FinanceCampaignsPanel({ periodCampaigns, allCampaigns, periodLabel, searching, onOpenEntry, onOpenReceivable }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const periodById = new Map(periodCampaigns.map((c) => [c.id, c]));
  if (!allCampaigns.length) return <EmptyNote>Nessuna campagna di prenotazione registrata.</EmptyNote>;
  const open = allCampaigns.find((c) => c.id === openId);
  const openPeriod = open ? periodById.get(open.id) : undefined;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Incassi, uscite e netto riguardano il periodo ({periodLabel}). Pattuito e da incassare riguardano la campagna intera, indipendenti da periodo e ricerca.{searching ? " Con la ricerca attiva incassi, uscite e netto contano solo i movimenti trovati." : ""}
      </p>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Campagna</th><th className="px-3 py-2 text-right">Prenot.</th>
              <th className="px-3 py-2 text-right">Incassi periodo</th><th className="px-3 py-2 text-right">Uscite periodo</th>
              <th className="px-3 py-2 text-right">Netto periodo</th><th className="px-3 py-2 text-right">Pattuito (campagna intera)</th>
              <th className="px-3 py-2 text-right">Da incassare (campagna intera)</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {allCampaigns.map((c) => {
              const p = periodById.get(c.id);
              return (
                <tr key={c.id} data-testid={`finance-campaign-${c.id}`} className={openId === c.id ? "bg-accent/50" : ""}>
                  <td className="px-3 py-2">
                    <button type="button" className="min-h-[32px] text-left font-medium underline-offset-2 hover:underline" aria-expanded={openId === c.id} onClick={() => setOpenId(openId === c.id ? null : c.id)}>{c.name}</button>
                    <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">{campaignTag(c.id)}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.bookings}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{eur(p?.income ?? 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-rose-700">{eur(p?.expenses ?? 0)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{eur(p?.net ?? 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{eur(c.agreed)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{eur(c.outstanding)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {open && (
        <div className="space-y-3 rounded-lg border bg-card p-3" data-testid="finance-campaign-detail">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-playfair text-lg">{open.name} <span className="font-mono text-xs text-muted-foreground">{campaignTag(open.id)}</span></h3>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpenId(null)}>Chiudi</Button>
          </div>
          <h4 className="text-sm font-medium">Incassi e uscite nel periodo</h4>
          <MovementsTable rows={openPeriod?.entries ?? []} onOpen={onOpenEntry} />
          <h4 className="text-sm font-medium">Da incassare{searching ? " (voci trovate)" : " (campagna intera)"}</h4>
          <ReceivablesTable rows={open.receivables} onOpen={onOpenReceivable} />
        </div>
      )}
    </div>
  );
}
